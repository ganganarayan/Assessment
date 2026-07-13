import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { markResultViewed } from "@/features/events/record";
import { resultUrlFor } from "@/lib/events/completion";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";
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
}: {
  params: Promise<{ slug: string; submissionId: string }>;
}) {
  const { slug, submissionId } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      status: true,
      resultSnapshot: true,
      resultToken: true,
      customerId: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      assessment: { select: { slug: true, title: true, targetUrl: true } },
    },
  });
  if (!submission || submission.assessment.slug !== slug) notFound();

  const user = await getCurrentUser();
  const isOwner = user ? isPlatformOwner(user.email) : false;

  // result.viewed represents the RESPONDENT opening their result — don't fire it
  // for an admin review.
  if (!isOwner) await markResultViewed(submissionId);

  const snap = submission.resultSnapshot as unknown as ResultSnapshot | null;

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
                <Field label="Profession">{submission.leadProfession?.trim() || "—"}</Field>
              </div>
            </CardContent>
          </Card>

          <AiStatementManager slug={slug} submissionId={submissionId} rows={aiRows} />

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
