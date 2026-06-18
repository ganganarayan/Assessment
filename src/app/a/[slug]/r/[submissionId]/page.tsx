import { notFound } from "next/navigation";
import { getSubmissionResult } from "@/features/assessment/data";
import { markResultViewed } from "@/features/events/record";

export const dynamic = "force-dynamic";

/**
 * Built-in fallback confirmation page. It is reached only when an assessment has
 * no Destination URL (Destination URL is mandatory for new assessments, so in
 * practice this is a safety net for legacy assessments / direct navigation).
 *
 * It DELIBERATELY renders NO score, band, or category breakdown — results are
 * delivered ONLY via the configured destination page (token + connector reading
 * /api/r/:token). getSubmissionResult also selects no lead PII. Do not add
 * results or PII to this page.
 */
export default async function ResultPage({
  params,
}: {
  params: Promise<{ slug: string; submissionId: string }>;
}) {
  const { slug, submissionId } = await params;
  const submission = await getSubmissionResult(submissionId);

  if (!submission || submission.assessment.slug !== slug) notFound();

  // Emit result.viewed once (server-side; no UI impact, non-blocking webhook).
  await markResultViewed(submissionId);

  const completed = submission.status === "COMPLETED";
  const thankYou = submission.assessment.thankYouMessage?.trim();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          {submission.assessment.title}
        </p>
        {completed ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">
              Your assessment has been recorded
            </h1>
            <p className="text-[var(--muted-foreground)]">
              {thankYou && thankYou.length > 0
                ? thankYou
                : "Thank you for completing the assessment."}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight">Almost there</h1>
            <p className="text-[var(--muted-foreground)]">
              This submission is not complete yet.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
