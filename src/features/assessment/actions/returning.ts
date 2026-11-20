"use server";

import { prisma } from "@/lib/db/prisma";
import { previewBypassesLock } from "@/lib/funnel/preview-bypass";
import { evaluateLockout } from "@/features/assessment/lockout";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Is this browser someone who already completed the funnel and is still inside the
 * retake lock? Asked on page load, BEFORE any question, so a returning person meets
 * "already completed" and their result straight away instead of after the opt-in.
 *
 * Matched on the first-party visitor id (a360_xid, stored on every submission as
 * metaExternalId). When this browser has no match, nothing is decided here and the
 * opt-in match in startSubmission runs exactly as before.
 *
 * Same lock rules as startSubmission: UNLIMITED never locks, paid funnels lock on
 * payment, and the owner's preview or signed test link steps aside.
 */
export interface ReturningVisitor {
  locked: boolean;
  policy?: "DELAYED" | "NEVER";
  lastCompletedAt?: string | null;
  nextAvailableAt?: string | null;
  resultAvailable?: boolean;
  /** The previous run, to render its result on screen. Only for this same browser. */
  resultSubmissionId?: string | null;
}

export async function checkReturningVisitor(
  slug: string,
  externalId: string | null,
  preview: boolean,
): Promise<ActionResult<ReturningVisitor>> {
  const xid = typeof externalId === "string" ? externalId.trim().slice(0, 64) : "";
  if (!xid) return { ok: true, data: { locked: false } };

  const assessment = await prisma.assessment.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true, tenantId: true, retakePolicy: true, retakeDays: true, paidMode: true, platformSignup: true },
  });
  if (!assessment || assessment.retakePolicy === "UNLIMITED" || assessment.platformSignup) {
    return { ok: true, data: { locked: false } };
  }
  if (preview && (await previewBypassesLock(assessment))) return { ok: true, data: { locked: false } };

  const last = await prisma.submission.findFirst({
    where: assessment.paidMode
      ? { assessmentId: assessment.id, metaExternalId: xid, completedPaidAt: { not: null }, isPreview: false }
      : { assessmentId: assessment.id, metaExternalId: xid, status: "COMPLETED", isPreview: false },
    orderBy: assessment.paidMode ? { completedPaidAt: "desc" } : { completedAt: "desc" },
    select: { id: true, completedAt: true, completedPaidAt: true, resultToken: true, leadEmail: true },
  });
  if (!last) return { ok: true, data: { locked: false } };

  const lockAt = assessment.paidMode ? last.completedPaidAt : last.completedAt;
  const policy = assessment.retakePolicy as "DELAYED" | "NEVER";
  const verdict = evaluateLockout(policy, assessment.retakeDays, lockAt, new Date());
  if (!verdict.locked) return { ok: true, data: { locked: false } };

  return {
    ok: true,
    data: {
      locked: true,
      policy,
      lastCompletedAt: lockAt?.toISOString() ?? null,
      nextAvailableAt: verdict.nextAvailableAt?.toISOString() ?? null,
      resultAvailable: Boolean(last.resultToken && last.leadEmail),
      resultSubmissionId: last.id,
    },
  };
}
