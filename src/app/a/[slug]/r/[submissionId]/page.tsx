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
import { type ResultSnapshot } from "@/lib/result/snapshot";
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
  const { slug, submissionId } = await params;
  const sp = await searchParams;
  const token = Array.isArray(sp.t) ? sp.t[0] : sp.t;
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      status: true,
      resultSnapshot: true,
      resultToken: true,
      reportNote: true,
      customerId: true,
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
          useAiStatement: true,
          professionLabel: true,
          engine: true,
          tenantId: true,
          categories: { select: { name: true, page: true } },
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

  // result.viewed represents the RESPONDENT opening their result — don't fire it
  // for an internal (admin/tenant) review.
  if (!canViewInternally) await markResultViewed(submissionId);

  const snap = submission.resultSnapshot as unknown as ResultSnapshot | null;

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
        {canViewInternally ? (
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
          bookingUrl={setting?.bookingUrl ?? null}
          resultUrl={resultUrl}
          title={submission.assessment.title}
          answers={clinicAnswers.map((c) => ({
            name: c.name,
            rows: c.rows.map((r) => ({ text: r.text, answerLabel: r.answerLabel, role: r.role })),
          }))}
          retakeUrl={`${proto}://${host}/a/${slug}`}
        />
      </main>
    );
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

          {snap.categories.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Category breakdown</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                {snap.categories.map((c, i) => {
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
    // Group the category breakdown by page (1 = assessment, 2 = queries) so both
    // scored pages show as separate sections. Page is looked up by name at render time.
    const pageByName = new Map(submission.assessment.categories.map((c) => [c.name, c.page ?? 1]));
    const cats = snap.categories ?? [];
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
