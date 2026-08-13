import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { computeResult } from "@/lib/scoring/clinic-audit";
import { ClinicAuditResult } from "@/features/assessment/components/public/clinic-audit-result";
import { markResultViewed } from "@/features/events/record";
import { resultUrlFor } from "@/lib/events/completion";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { getAiStatements } from "@/features/admin/data/ai-statements";
import { getSubmissionQuestionBreakdown } from "@/features/admin/data/submission-questions";
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
          // Author-set band words (Running on Luck / Feast or Famine / …). The clinic
          // engine has no score %, so we map its ₹-gap band to the matching LEVEL and
          // show the author's title as the result headline.
          resultBands: { select: { level: true, title: true, description: true } },
        },
      },
    },
  });
  if (!submission || submission.assessment.slug !== slug) notFound();

  const user = await getCurrentUser();
  const isOwner = user ? isSuperAdmin(user) : false;

  // result.viewed represents the RESPONDENT opening their result — don't fire it
  // for an admin review.
  if (!isOwner) await markResultViewed(submissionId);

  const snap = submission.resultSnapshot as unknown as ResultSnapshot | null;

  // ---- Clinic-audit engine: branded interactive result --------------------
  // Token-gated like the other respondent results (owner or matching ?t=token).
  // Renders from the clinic snapshot; the client recomputes edits via the same
  // pure engine. Takes precedence over the generic branches for this engine.
  if (
    submission.assessment.engine === "CLINIC_AUDIT" &&
    snap?.clinic &&
    submission.status === "COMPLETED" &&
    (isOwner || (!!token && token === submission.resultToken))
  ) {
    const setting = submission.assessment.tenantId
      ? await prisma.appSetting.findUnique({
          where: { tenantId: submission.assessment.tenantId },
          select: { bookingUrl: true },
        })
      : null;
    const original = computeResult(snap.clinic.inputs, snap.clinic.config);
    // Map the clinic ₹-gap band → the author's Result Band title (by matching level).
    // CRITICAL/HIGH line up; the clinic MODERATE ↔ MEDIUM, BELOW_THRESHOLD ↔ LOW.
    const clinicBandToLevel: Record<string, string> = {
      CRITICAL: "CRITICAL",
      HIGH: "HIGH",
      MODERATE: "MEDIUM",
      BELOW_THRESHOLD: "LOW",
    };
    const bandByLevel = new Map(submission.assessment.resultBands.map((b) => [b.level as string, b]));
    const matchedBand = bandByLevel.get(clinicBandToLevel[original.band] ?? "");
    const bandLabel = matchedBand?.title ?? null;
    const bandNote = matchedBand?.description ?? null;
    const h = await headers();
    const host = h.get("host") ?? "";
    const proto = h.get("x-forwarded-proto") ?? "https";
    const resultUrl = `${proto}://${host}/a/${slug}/r/${submissionId}${
      token ? `?t=${encodeURIComponent(token)}` : ""
    }`;
    return (
      <main style={{ minHeight: "100vh", background: "#F7F5F0" }}>
        <ClinicAuditResult
          inputs={snap.clinic.inputs}
          config={snap.clinic.config}
          original={original}
          prose={snap.clinic.prose}
          bookingUrl={setting?.bookingUrl ?? null}
          resultUrl={resultUrl}
          title={submission.assessment.title}
          bandLabel={bandLabel}
          bandNote={bandNote}
        />
      </main>
    );
  }

  // ---- Admin review: full result ------------------------------------------
  if (isOwner && submission.status === "COMPLETED" && snap) {
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
    (isOwner || (!!token && token === submission.resultToken))
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
