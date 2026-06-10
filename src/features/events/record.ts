import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { emitEvent } from "@/lib/events/emit";

/**
 * Record a result view exactly once. Called from the result page (server) on
 * load; the compare-and-swap on resultViewedAt ensures result.viewed fires only
 * the first time a given submission's result is opened.
 */
export async function markResultViewed(submissionId: string): Promise<void> {
  const claim = await prisma.submission.updateMany({
    where: { id: submissionId, resultViewedAt: null, status: "COMPLETED" },
    data: { resultViewedAt: new Date() },
  });
  if (claim.count === 0) return; // already viewed, not found, or not completed

  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      assessmentId: true,
      leadEmail: true,
      totalScore: true,
      maxScore: true,
      assessment: { select: { slug: true, title: true } },
      resultBand: { select: { level: true, title: true } },
    },
  });
  if (!s) return;

  await emitEvent(
    EventType.RESULT_VIEWED,
    {
      submissionId: s.id,
      assessment: { slug: s.assessment.slug, title: s.assessment.title },
      scores: { total: s.totalScore, max: s.maxScore },
      result: s.resultBand
        ? { level: s.resultBand.level, title: s.resultBand.title }
        : null,
    },
    { submissionId: s.id, assessmentId: s.assessmentId, leadEmail: s.leadEmail },
  );
}
