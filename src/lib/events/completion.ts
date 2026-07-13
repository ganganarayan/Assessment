import "server-only";
import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { emitEvent } from "@/lib/events/emit";
import { normalizeAttribution } from "@/lib/events/payload";
import { type EmitInput } from "@/features/events/types";
import { type ResultSnapshot } from "@/lib/result/snapshot";

export function resultUrlFor(targetUrl: string | null, slug: string, submissionId: string, token: string | null): string {
  if (targetUrl && token) {
    try {
      const u = new URL(targetUrl);
      u.searchParams.set("t", token);
      return u.toString();
    } catch {
      /* fall through */
    }
  }
  return `${env.NEXT_PUBLIC_APP_URL}/a/${slug}/r/${submissionId}`;
}

/**
 * Build the full completion EmitInput (score/band/categories/ai/lead/result url)
 * from a submission's stored snapshot — shared by the paid + unpaid emitters.
 */
export async function loadCompletionInput(submissionId: string): Promise<EmitInput | null> {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      customerId: true,
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      attribution: true,
      resultSnapshot: true,
      assessment: {
        select: { id: true, slug: true, title: true, targetUrl: true, tenant: { select: { id: true, slug: true, name: true } } },
      },
    },
  });
  if (!s || !s.assessment) return null;
  const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;

  return {
    submissionId,
    customerId: s.customerId,
    tenant: s.assessment.tenant,
    assessment: { id: s.assessment.id, slug: s.assessment.slug, title: s.assessment.title },
    lead: {
      firstName: s.leadFirstName,
      lastName: s.leadLastName,
      email: s.leadEmail,
      mobile: s.leadMobile,
      profession: s.leadProfession,
    },
    score: snap && typeof snap.scoreRaw === "number" ? { total: snap.scoreRaw, max: snap.max, percentage: snap.scorePercent } : null,
    resultBand: snap?.resultBandLevel ? { level: snap.resultBandLevel, title: snap.resultBand ?? "" } : null,
    categories: Array.isArray(snap?.categories) ? snap.categories : null,
    resultUrl: resultUrlFor(s.assessment.targetUrl, s.assessment.slug, submissionId, s.resultToken),
    aiStatement: snap?.aiStatement ?? null,
    attribution: normalizeAttribution(s.attribution) ?? undefined,
  };
}

/**
 * Fire `completed_paid` once for a submission (on verified payment). Guarded by a
 * compare-and-swap on completedPaidAt + status COMPLETED so a duplicate verify
 * never double-emits and an out-of-order payment (before completion) is skipped.
 * Never throws (the verify route must still redirect); on emit failure the claim
 * is rolled back so a retry can re-emit.
 */
export async function emitCompletedPaid(submissionId: string): Promise<void> {
  // Key on completedAt (ever completed) + completedPaidAt null, NOT on the live
  // status — a re-completion may have transiently flipped status to STARTED, and
  // the payment must still be recorded.
  const claim = await prisma.submission.updateMany({
    where: { id: submissionId, completedAt: { not: null }, completedPaidAt: null },
    data: { completedPaidAt: new Date() },
  });
  if (claim.count === 0) return; // already emitted, or never completed
  try {
    const input = await loadCompletionInput(submissionId);
    if (input) await emitEvent(EventType.ASSESSMENT_COMPLETED_PAID, input);
  } catch (e) {
    // Roll back the claim so a re-hit of the verify route can re-emit.
    await prisma.submission.updateMany({ where: { id: submissionId }, data: { completedPaidAt: null } }).catch(() => {});
    console.error("[completed_paid] emit failed, rolled back:", e instanceof Error ? e.message : String(e));
  }
}
