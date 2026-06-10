import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { emitEvent } from "@/lib/events/emit";
import { type EmitInput } from "@/features/events/types";

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
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      totalScore: true,
      maxScore: true,
      assessment: {
        select: {
          id: true,
          slug: true,
          title: true,
          tenant: { select: { id: true, slug: true, name: true } },
        },
      },
      resultBand: { select: { level: true, title: true } },
    },
  });
  if (!s) return;

  const total = s.totalScore ?? 0;
  const max = s.maxScore ?? 0;
  const percentage = max > 0 ? Math.round((total / max) * 100) : 0;

  await emitEvent(EventType.RESULT_VIEWED, {
    submissionId: s.id,
    tenant: s.assessment.tenant,
    assessment: { id: s.assessment.id, slug: s.assessment.slug, title: s.assessment.title },
    lead: {
      firstName: s.leadFirstName,
      lastName: s.leadLastName,
      email: s.leadEmail,
      mobile: s.leadMobile,
    },
    score: { total, max, percentage },
    resultBand: s.resultBand ? { level: s.resultBand.level, title: s.resultBand.title } : null,
  } satisfies EmitInput);
}
