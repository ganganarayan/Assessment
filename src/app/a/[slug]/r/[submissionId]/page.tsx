import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { computeResult, deriveInputs, resolveEngineConfig } from "@/lib/scoring/clinic-audit";
import { formatINR } from "@/lib/format/inr";
import { ClinicAuditResult } from "@/features/assessment/components/public/clinic-audit-result";
import { markResultViewed } from "@/features/events/record";
import { resultUrlFor } from "@/lib/events/completion";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import { isResponseLocked, supportEmailFor } from "@/lib/billing/gate";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { VslResultPage } from "@/features/assessment/components/public/vsl-result-page";
import { readResultPage } from "@/features/assessment/result-page/blocks";
import { resolveVidapulseParam, stampVidapulseCtaUrl } from "@/lib/vidapulse";
import { getAiStatements } from "@/features/admin/data/ai-statements";
import { getSubmissionQuestionBreakdown } from "@/features/admin/data/submission-questions";
import { getClinicAnswers, getClinicRawAnswers } from "@/features/admin/data/clinic-answers";
import { AiStatementManager } from "@/features/admin/components/ai-statement-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Result page reached at /a/:slug/r/:submissionId.
 *  - The signed-in PLATFORM OWNER sees the full result (the admin "Result" link
 *    in Submissions lands here) — for review.
 *  - Everyone else (the public) NEVER sees results here; results are delivered
 *    only via the destination page (token + connector). This is our decision.
 */
/** One labelled field: label on the left, value to its right on the same line. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-24 shrink-0 text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export default async function ResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; submissionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, submissionId: urlSubmissionId } = await params;
  const sp = await searchParams;
  const token = Array.isArray(sp.t) ? sp.t[0] : sp.t;
  // Admin-only: force the native VSL page to render (any next-step) so it can be
  // previewed while the assessment still points at an external URL. Gated on
  // canViewInternally below, so it is never a public bypass.
  const preview = sp.preview === "1";
  // A shared clinic link carries ?t=<token>, which identifies a PERSON. Resolve to
  // that person's NEWEST completed attempt for this assessment, so a retake surfaces
  // on the same already-shared link (mirrors /api/r). Every attempt stays stored with
  // its own completedAt; only the latest is served here. Without a token we render
  // the exact submission named in the URL (the admin's internal "Result" link).
  let submissionId = urlSubmissionId;
  if (token) {
    const tokenRow = await prisma.submission.findUnique({
      where: { resultToken: token },
      select: { assessmentId: true, identifierValue: true, assessment: { select: { paidMode: true } } },
    });
    if (tokenRow?.identifierValue) {
      const paid = tokenRow.assessment.paidMode;
      const newest = await prisma.submission.findFirst({
        where: paid
          ? { assessmentId: tokenRow.assessmentId, identifierValue: tokenRow.identifierValue, completedPaidAt: { not: null } }
          : { assessmentId: tokenRow.assessmentId, identifierValue: tokenRow.identifierValue, status: "COMPLETED" },
        orderBy: paid ? { completedPaidAt: "desc" } : { completedAt: "desc" },
        select: { id: true },
      });
      if (newest?.id) submissionId = newest.id;
    }
  }
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      status: true,
      resultSnapshot: true,
      resultToken: true,
      reportNote: true,
      customerId: true,
      periodSeq: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      completedAt: true,
      assessment: {
        select: {
          slug: true,
          title: true,
          targetUrl: true,
          nextStep: true,
          resultsContinueUrl: true,
          resultsContinueLabel: true,
          useAiStatement: true,
          professionLabel: true,
          engine: true,
          tenantId: true,
          resultPagePublished: true,
          categories: { select: { name: true, page: true, displayOrder: true } },
        },
      },
    },
  });
  if (!submission || submission.assessment.slug !== slug) notFound();

  const user = await getCurrentUser();
  // isSuperOwner gates the RAW ADMIN VIEW below (AI statement tools etc.) — those
  // actions (features/admin/actions/ai-statements.ts) are super-admin-only, so
  // exposing that branch to a tenant admin would render buttons that silently
  // redirect on click. Stays super-admin-only.
  const isSuperOwner = user ? isSuperAdmin(user) : false;
  // canViewInternally additionally allows a TENANT admin/staff to view (read-only)
  // a result belonging to their OWN tenant, without a token — this is what the
  // "Result" link in /w/submissions (and /admin/submissions) relies on. Previously
  // this was isSuperOwner-only, so a tenant admin clicking "Result" on their own
  // submission fell through every branch to the blank public fallback page.
  let canViewInternally = isSuperOwner;
  if (user && !isSuperOwner && submission.assessment.tenantId) {
    // Fresh read: the session's tenantId can be stale if assignment changed mid-session.
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { tenantId: true } });
    canViewInternally = fresh?.tenantId === submission.assessment.tenantId;
  }

  // A token link is the CLIENT-shareable one: never show the internal contact/band
  // block on it, even to a signed-in admin, so the operator previewing the link sees
  // exactly what the clinic owner will. The admin's full internal view is the same
  // page WITHOUT ?t= (the "Result" link in Submissions).
  const showInternal = canViewInternally && !token;

  // Optional "Show results on assess360" onward button, shown at the bottom of the
  // result on both the clinic recalc and the generic band result. Null => no button.
  const continueUrl = submission.assessment.resultsContinueUrl?.trim() || null;
  const continueLabel = submission.assessment.resultsContinueLabel?.trim() || "Continue";
  // The button routes through /api/onward/:id (not the raw external URL) so the click
  // is tracked server-side (bumps the VSL counter) and the token rides along to the
  // destination — with NO code required on the destination page. Null => no button.
  const onwardHref = continueUrl ? `/api/onward/${submissionId}` : null;

  // Billing gate: a result over the tenant's response cap is LOCKED — neither the
  // respondent nor the tenant admin may see it (only the platform owner, who is never
  // limited, can review). Show a neutral "results unavailable — contact support" page.
  const locked = await isResponseLocked(submission.assessment.tenantId, submission.periodSeq);
  if (locked && !isSuperOwner) {
    const supportEmail = await supportEmailFor(submission.assessment.tenantId);
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight">Thanks — your responses are in.</h1>
        <p className="text-[var(--muted-foreground)]">
          Your results aren&apos;t available to view right now. If you&apos;d like your results,
          please reach out and we&apos;ll help you out.
        </p>
        {supportEmail ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Contact support:{" "}
            <a href={`mailto:${supportEmail}`} className="font-semibold text-[var(--foreground)] underline">
              {supportEmail}
            </a>
          </p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">Please contact support for your results.</p>
        )}
      </div>
    );
  }

  // result.viewed represents the RESPONDENT opening their result — don't fire it
  // for an internal (admin/tenant) review.
  if (!canViewInternally) await markResultViewed(submissionId);

  const snap = submission.resultSnapshot as unknown as ResultSnapshot | null;

  // Categories in the builder's order (displayOrder), not the stored snapshot's
  // scoring-iteration order — so the serial numbers baked into names/questions read
  // in sequence. Also repairs already-completed submissions saved before this fix.
  const catOrder = new Map(submission.assessment.categories.map((c) => [c.name, c.displayOrder]));
  const orderedCats = snap
    ? [...snap.categories].sort((a, b) => (catOrder.get(a.name) ?? 0) - (catOrder.get(b.name) ?? 0))
    : [];

  // ---- Clinic-audit engine: branded interactive result --------------------
  // Reachable by the submission id ALONE — no token, no sign-in. The id is an
  // unguessable cuid, and this page is built to be forwarded ("Send this to the
  // clinic owner"), so requiring ?t= made the SAME url behave differently for the
  // sender and the recipient: whoever opened it without the token got a bare
  // "assessment recorded" page. Renders from the clinic snapshot; the client
  // recomputes edits via the same pure engine. Precedes the generic branches.
  if (
    submission.assessment.engine === "CLINIC_AUDIT" &&
    snap?.clinic &&
    submission.status === "COMPLETED"
  ) {
    const setting = submission.assessment.tenantId
      ? await prisma.appSetting.findUnique({
          where: { tenantId: submission.assessment.tenantId },
          select: { bookingUrl: true },
        })
      : null;
    // The ₹-gap band is still computed and stored (submission.ts) for INTERNAL
    // triage — Submissions table, CRM webhook segmentation. It is deliberately NOT
    // shown to the respondent: a fixed category label can only ever contradict the
    // calculation trail below (a small-gap clinic can still be genuinely desperate;
    // a big-gap one merely comfortable) — the numbers make the case on their own.
    // Re-derive the funnel inputs from the STORED ANSWERS instead of trusting the
    // snapshot's pre-converted numbers, so a correction to how a question's scale is
    // read applies to every submission — including ones scored before the fix. Falls
    // back to the snapshot when the answers are unavailable.
    const rawAnswers = await getClinicRawAnswers(submissionId);
    // Merge the STORED config over the current defaults: a snapshot written before
    // a config key existed carries no value for it, and reading that key straight
    // off the snapshot yields undefined — which turns every derived figure into NaN.
    const liveConfig = resolveEngineConfig(snap.clinic.config);
    const liveInputs = rawAnswers.length > 0 ? deriveInputs(rawAnswers, liveConfig) : snap.clinic.inputs;
    const original = computeResult(liveInputs, liveConfig);
    const h = await headers();
    const host = h.get("host") ?? "";
    const proto = h.get("x-forwarded-proto") ?? "https";
    const resultUrl = `${proto}://${host}/a/${slug}/r/${submissionId}${
      token ? `?t=${encodeURIComponent(token)}` : ""
    }`;
    // Raw funnel inputs, for the internal-only block below — role, the number the
    // engine actually used, and whether it was assumed (range midpoint) or a typed
    // actual figure. Never shown to the respondent.
    const inputRows: { label: string; value: string; assumed: boolean }[] = [
      { label: "Enquiries", value: String(original.enquiries), assumed: original.assumptions.includes("monthly enquiries") },
      { label: "Booking rate", value: `${Math.round(original.bookRateNow * 100)}%`, assumed: original.assumptions.includes("booking rate") },
      { label: "Show-up rate", value: `${Math.round(original.showUpNow * 100)}%`, assumed: original.assumptions.includes("show-up rate") },
      { label: "Close rate", value: `${Math.round(original.closeRate * 100)}%`, assumed: original.assumptions.includes("close rate") },
      { label: "Treatment value", value: formatINR(original.treatmentValue), assumed: original.assumptions.includes("treatment value") },
      { label: "Ad spend", value: formatINR(original.adSpend), assumed: original.assumptions.includes("ad spend") },
      { label: "Dormant list", value: String(original.dormant.count), assumed: original.assumptions.includes("dormant list size") },
      { label: "Spare capacity", value: String(original.capacity), assumed: original.assumptions.includes("spare capacity") },
    ];
    // Their answers, question by question, grouped by category — shown in full to
    // internal viewers (with the value the engine used, so a misconfigured option
    // is visible), and to the respondent so they can spot a typo in what they filled.
    const clinicAnswers = await getClinicAnswers(submissionId);
    return (
      <main style={{ minHeight: "100vh", background: "#F7F5F0" }}>
        {/* Colours come from the THEME tokens, never a hardcoded white — the app
            renders dark for signed-in staff, so a fixed white panel made every
            value (which inherits --foreground) white-on-white and invisible. */}
        {showInternal ? (
          <div className="border-b border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]">
            <div className="mx-auto w-full max-w-2xl px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Internal — not shown to the respondent
              </p>
              {original.dataInconsistent ? (
                <div className="mt-2 rounded-md border border-amber-500 bg-amber-500/10 px-3 py-2 text-sm">
                  <strong>Data looks mis-scaled.</strong>{" "}
                  {original.suspectRoles.length > 0 ? (
                    <>
                      The{" "}
                      {original.suspectRoles
                        .map((r) =>
                          r === "SHOWUP_RATE" ? "show-up rate" : r === "CLOSE_RATE" ? "close rate" : "booking rate",
                        )
                        .join(" and ")}{" "}
                      came out implausibly low. If those questions are worded &ldquo;out of every
                      10&rdquo;, set their <strong>unit to &ldquo;Out of 10&rdquo;</strong> in the
                      builder — otherwise an answer of 7 is read as 7%, not 70%.
                    </>
                  ) : (
                    <>This funnel computes to under one case a month, so a figure is in the wrong scale.</>
                  )}
                </div>
              ) : null}
              {/* The booking CTA is the whole point of this page, so a missing
                  calendar link must be loud HERE rather than silently dropping the
                  button from the respondent's view. */}
              {!setting?.bookingUrl ? (
                <div className="mt-2 rounded-md border border-amber-500 bg-amber-500/10 px-3 py-2 text-sm">
                  <strong>No booking link set.</strong> The &ldquo;Book an appointment&rdquo; button
                  is hidden for the respondent until you save a calendar link in{" "}
                  <a className="underline" href={isSuperOwner ? "/admin/settings" : "/w/settings"}>
                    Settings &rarr; Booking / calendar link
                  </a>
                  .
                </div>
              ) : null}
              <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                <Field label="Name">{[submission.leadFirstName, submission.leadLastName].filter(Boolean).join(" ") || "—"}</Field>
                <Field label="Phone">{submission.leadMobile?.trim() || "—"}</Field>
                <Field label="Email">{submission.leadEmail?.trim() || "—"}</Field>
                <Field label={submission.assessment.professionLabel?.trim() || "Profession"}>{submission.leadProfession?.trim() || "—"}</Field>
                <Field label="Completed">{submission.completedAt ? new Date(submission.completedAt).toLocaleString() : "—"}</Field>
                <Field label="Internal band">{original.band}{original.notViable ? " · not viable" : ""}{original.capacityBlocked ? " · capacity-blocked" : ""}</Field>
              </div>
              {/* Always visible (not a <details>) — collapsed content is invisible
                  when the page is printed or saved to PDF, which is exactly when
                  these figures are needed most. */}
              <div className="mt-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Raw funnel inputs used in this calculation
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-4">
                  {inputRows.map((row) => (
                    <div key={row.label} className="flex flex-col">
                      <span className="text-xs text-[var(--muted-foreground)]">{row.label}</span>
                      <span>
                        {row.value}
                        {row.assumed ? <span className="ml-1 text-xs text-[var(--muted-foreground)]">(assumed)</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 border-t pt-3 text-xs text-[var(--muted-foreground)]">
                Below is exactly what the respondent sees.
              </p>
            </div>
          </div>
        ) : null}
        <ClinicAuditResult
          inputs={liveInputs}
          config={liveConfig}
          original={original}
          prose={snap.clinic.prose}
          // A booking URL may itself be a VidaPulse CTA tracking link, in which case
          // the click is stamped with this respondent's ids (the anchor below carries
          // rel="noreferrer", so they have to be in the URL). Any other URL is passed
          // through untouched.
          bookingUrl={stampVidapulseCtaUrl(
            setting?.bookingUrl ?? null,
            submission.customerId ?? null,
            submission.resultToken ?? null,
          )}
          resultUrl={resultUrl}
          title={submission.assessment.title}
          continueUrl={onwardHref}
          continueLabel={continueLabel}
          answers={clinicAnswers.map((c) => ({
            name: c.name,
            rows: c.rows.map((r) => ({ text: r.text, answerLabel: r.answerLabel, role: r.role })),
          }))}
          retakeUrl={`${proto}://${host}/a/${slug}`}
        />
      </main>
    );
  }

  // ---- Native VSL result page (RESULTS mode, builder-built) ----------------
  // Rendered whenever the TOKEN (respondent) link is used — including by a signed-in
  // admin previewing via ?t=. It must come BEFORE the admin-review branch below, which
  // otherwise intercepts every super-admin visit (even with a token) and shows the raw
  // admin view instead of the page the respondent actually sees. The no-token internal
  // "Result" link still falls through to the admin view for data review.
  // An admin can also force a preview with ?preview=1 (any next-step), so the builder
  // page can be checked while an assessment still points at an external URL.
  if (
    submission.status === "COMPLETED" &&
    snap &&
    ((submission.assessment.nextStep === "RESULTS" && !!token && token === submission.resultToken) ||
      (canViewInternally && preview))
  ) {
    const vslPage = readResultPage(submission.assessment.resultPagePublished ?? null);
    if (vslPage.blocks.length > 0) {
      // A real respondent reaching the native VSL page counts as a VSL load — the SAME
      // resultFetchCount the external destination bumps via /api/r — so the "VSL" column
      // reflects native and external views alike. Admin previews (canViewInternally) are
      // excluded. Fire-and-forget so a count write never blocks the render.
      if (!canViewInternally) {
        void prisma.submission
          .updateMany({ where: { id: submissionId }, data: { resultFetchCount: { increment: 1 } } })
          .catch(() => {});
      }
      const tid = submission.assessment.tenantId ?? null;
      const vpSetting = tid
        ? await prisma.appSetting.findUnique({ where: { tenantId: tid }, select: { vidapulseTrackingEnabled: true, vidapulseParam: true } })
        : await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { vidapulseTrackingEnabled: true, vidapulseParam: true } });
      return (
        <VslResultPage
          page={vslPage}
          aiStatement={submission.assessment.useAiStatement ? snap.aiStatement ?? null : null}
          customerId={submission.customerId ?? null}
          // Stamped onto any VidaPulse CTA button on the page. The token is the
          // one id present on EVERY link this app emits (fresh completions and
          // nurture links alike), so it is what makes the click traceable even
          // when an older link carries no cid.
          resultToken={submission.resultToken ?? null}
          vidapulseParam={resolveVidapulseParam(vpSetting)}
        />
      );
    }
  }

  // ---- Admin review: full result (super admin only — see canViewInternally note
  //      above re: AiStatementManager's actions being super-admin-gated) ---------
  if (isSuperOwner && submission.status === "COMPLETED" && snap) {
    const aiRows = await getAiStatements(submissionId);
    const breakdown = await getSubmissionQuestionBreakdown(submissionId);
    const questionsByCategory = new Map(breakdown.map((b) => [b.name, b.questions]));
    return (
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-10">
        <div className="flex gap-4">
          <Link
            href="/admin/submissions"
            className="sticky top-6 inline-flex h-fit shrink-0 items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          >
            ← Back
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-[var(--muted-foreground)]">{submission.assessment.title}</p>
              <h1 className="text-3xl font-bold tracking-tight">Result (admin view)</h1>
              <p className="text-xs text-[var(--muted-foreground)]">
                Only you (signed-in admin) see this. Respondents never see results on this page.
              </p>
            </div>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-lg">Respondent</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-10 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Field label="Name">{[submission.leadFirstName, submission.leadLastName].filter(Boolean).join(" ") || "—"}</Field>
                <Field label="Phone">{submission.leadMobile?.trim() || "—"}</Field>
                <Field label="Email">{submission.leadEmail?.trim() || "—"}</Field>
              </div>
              <div className="flex flex-col gap-2">
                <Field label="Customer ID">{submission.customerId || "—"}</Field>
                <Field label="Result link">
                  {(() => {
                    const link = resultUrlFor(submission.assessment.targetUrl, slug, submissionId, submission.resultToken);
                    return (
                      <a href={link} target="_blank" rel="noreferrer" className="break-all underline">
                        {link}
                      </a>
                    );
                  })()}
                </Field>
                <Field label="Report PDF">
                  <a href={`/api/reports/${submissionId}`} target="_blank" rel="noreferrer" className="underline">
                    View
                  </a>
                  <span className="text-[var(--muted-foreground)]">{"  ·  "}</span>
                  <a href={`/api/reports/${submissionId}?download=1`} className="underline">
                    Download
                  </a>
                </Field>
                <Field label={submission.assessment.professionLabel?.trim() || "Profession"}>{submission.leadProfession?.trim() || "—"}</Field>
              </div>
            </CardContent>
          </Card>

          <AiStatementManager slug={slug} submissionId={submissionId} rows={aiRows} initialNote={submission.reportNote} />

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                {snap.resultBand ? <Badge variant="outline">{snap.resultBand}</Badge> : null}
                <CardTitle>Overall: {snap.scorePercent}%</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm">
              Score {snap.scoreRaw} / {snap.max}
              {snap.resultSuggestion ? (
                <p className="mt-2 text-[var(--muted-foreground)]">{snap.resultSuggestion}</p>
              ) : null}
            </CardContent>
          </Card>

          {orderedCats.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Category breakdown</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                {orderedCats.map((c, i) => {
                  const qs = questionsByCategory.get(c.name) ?? [];
                  return (
                    <div
                      key={i}
                      className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {c.name}
                          {c.band ? ` — ${c.band}` : ""}
                        </span>
                        <span className="shrink-0 font-medium">
                          {c.score} / {c.max}
                        </span>
                      </div>
                      {c.meaning ? (
                        <p className="text-xs text-[var(--muted-foreground)]">{c.meaning}</p>
                      ) : null}
                      {qs.length > 0 ? (
                        <ul className="mt-1 flex flex-col gap-1.5">
                          {qs.map((q, j) => (
                            <li
                              key={j}
                              className="flex items-start justify-between gap-3 text-xs text-[var(--muted-foreground)]"
                            >
                              <span>
                                {q.text}
                                {q.answer ? (
                                  <span className="text-[var(--foreground)]"> — {q.answer}</span>
                                ) : null}
                              </span>
                              <span className="shrink-0 tabular-nums">
                                {q.score} / {q.max}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}
          </div>
        </div>
      </main>
    );
  }

  // ---- Respondent results IN-PLATFORM (nextStep RESULTS) -------------------
  // Only when the assessment is set to show results here AND the caller holds the
  // result token (same capability that gates the VSL link), or is the admin.
  if (
    submission.assessment.nextStep === "RESULTS" &&
    submission.status === "COMPLETED" &&
    snap &&
    (canViewInternally || (!!token && token === submission.resultToken))
  ) {
    // (The published VSL page, when present, is rendered earlier — before the admin
    // branch — so the token link shows it even to a signed-in admin. This branch is the
    // score-cards fallback for RESULTS assessments with no published result page.)
    // Group the category breakdown by page (1 = assessment, 2 = queries) so both
    // scored pages show as separate sections. Page is looked up by name at render time.
    const pageByName = new Map(submission.assessment.categories.map((c) => [c.name, c.page ?? 1]));
    const cats = orderedCats;
    const groups = [
      { key: 1, label: "Assessment", items: cats.filter((c) => (pageByName.get(c.name) ?? 1) === 1) },
      { key: 2, label: "Queries", items: cats.filter((c) => (pageByName.get(c.name) ?? 1) === 2) },
    ].filter((g) => g.items.length > 0);
    const twoPages = groups.length > 1;
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-[var(--muted-foreground)]">{submission.assessment.title}</p>
            <h1 className="text-3xl font-bold tracking-tight">Your results</h1>
          </div>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                {snap.resultBand ? <Badge variant="outline">{snap.resultBand}</Badge> : null}
                <CardTitle>Overall: {snap.scorePercent}%</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {snap.resultSuggestion ? <p className="whitespace-pre-line">{snap.resultSuggestion}</p> : null}
              {submission.assessment.useAiStatement && snap.aiStatement ? (
                <p className="whitespace-pre-line text-[var(--muted-foreground)]">{snap.aiStatement}</p>
              ) : null}
            </CardContent>
          </Card>
          {groups.map((g) => (
            <Card key={g.key}>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-lg">{twoPages ? g.label : "Category breakdown"}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {g.items.map((c) => (
                  <div key={c.name} className="flex flex-col gap-1 border-b border-[var(--border)] pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-sm text-[var(--muted-foreground)]">
                        {c.score}/{c.max}{c.band ? ` · ${c.band}` : ""}
                      </span>
                    </div>
                    {c.meaning ? <p className="whitespace-pre-line text-sm text-[var(--muted-foreground)]">{c.meaning}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          {/* Onward button (nextStep RESULTS): routes via /api/onward/:id so the
              click is tracked (VSL) and the token rides along — no code needed on
              the destination page. */}
          {onwardHref ? (
            <a
              href={onwardHref}
              className="inline-flex w-full items-center justify-center rounded-md bg-green-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              {continueLabel} →
            </a>
          ) : null}
        </div>
      </main>
    );
  }

  // ---- Public / fallback: neutral confirmation, never results --------------
  const completed = submission.status === "COMPLETED";
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--muted-foreground)]">{submission.assessment.title}</p>
        {completed ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">Your assessment has been recorded</h1>
            <p className="text-[var(--muted-foreground)]">Thank you for completing the assessment.</p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight">Almost there</h1>
            <p className="text-[var(--muted-foreground)]">This submission is not complete yet.</p>
          </>
        )}
      </div>
    </main>
  );
}
