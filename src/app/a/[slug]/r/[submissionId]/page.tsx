import { notFound } from "next/navigation";
import { getSubmissionResult } from "@/features/assessment/data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ slug: string; submissionId: string }>;
}) {
  const { slug, submissionId } = await params;
  const submission = await getSubmissionResult(submissionId);

  if (!submission || submission.assessment.slug !== slug) notFound();

  const band = submission.resultBand;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-[var(--muted-foreground)]">
            {submission.assessment.title}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Your result</h1>
        </div>

        {submission.status !== "COMPLETED" ? (
          <p className="text-[var(--muted-foreground)]">
            This submission is not complete yet.
          </p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  {band ? <Badge variant="outline">{band.level}</Badge> : null}
                  <CardTitle>{band?.title ?? "Result"}</CardTitle>
                </div>
                <CardDescription>
                  Total score: {submission.totalScore ?? 0}
                  {submission.maxScore ? ` / ${submission.maxScore}` : ""}
                </CardDescription>
              </CardHeader>
              {band?.description ? (
                <CardContent className="text-sm">{band.description}</CardContent>
              ) : null}
            </Card>

            {submission.categoryScores.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Category breakdown</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  {submission.categoryScores.map((cs) => (
                    <div
                      key={cs.id}
                      className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                    >
                      <span>{cs.category.name}</span>
                      <span className="font-medium">
                        {cs.score} / {cs.maxScore}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {submission.assessment.thankYouMessage ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                {submission.assessment.thankYouMessage}
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
