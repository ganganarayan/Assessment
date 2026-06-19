import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { markResultViewed } from "@/features/events/record";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";
import { type ResultSnapshot } from "@/lib/result/snapshot";
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
      assessment: { select: { slug: true, title: true } },
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
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-[var(--muted-foreground)]">{submission.assessment.title}</p>
            <h1 className="text-3xl font-bold tracking-tight">Result (admin view)</h1>
            <p className="text-xs text-[var(--muted-foreground)]">
              Only you (signed-in admin) see this. Respondents never see results on this page.
            </p>
          </div>

          {snap.aiStatement ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Personalized message</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-line text-sm">{snap.aiStatement}</CardContent>
            </Card>
          ) : null}

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
              <CardContent className="flex flex-col gap-2 text-sm">
                {snap.categories.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
                  >
                    <span>
                      {c.name}
                      {c.band ? ` — ${c.band}` : ""}
                      {c.meaning ? `: ${c.meaning}` : ""}
                    </span>
                    <span className="shrink-0 font-medium">
                      {c.score} / {c.max}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
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
