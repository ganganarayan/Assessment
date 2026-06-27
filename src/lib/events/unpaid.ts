import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { emitEvent } from "@/lib/events/emit";
import { loadCompletionInput } from "@/lib/events/completion";

const UNPAID_AFTER_MINUTES = 30;
const BATCH = 500;

/**
 * Find paid-mode submissions that COMPLETED but have no payment after the delay,
 * mark them (once) and emit `completed_unpaid` — the nudge pipeline. Mirrors the
 * abandoned sweep: the COMPLETED->completedUnpaidAt flip is a compare-and-swap, so
 * the event fires at most once even if the sweep overlaps itself or a late payment.
 */
export async function sweepCompletedUnpaid(): Promise<{ swept: number; scanned: number }> {
  const cutoff = new Date(Date.now() - UNPAID_AFTER_MINUTES * 60 * 1000);

  const candidates = await prisma.submission.findMany({
    where: {
      status: "COMPLETED",
      completedUnpaidAt: null,
      completedPaidAt: null, // never fire for a payer
      completedAt: { lt: cutoff },
      assessment: { is: { paidMode: true } },
    },
    select: { id: true },
    take: BATCH,
  });

  let swept = 0;
  for (const c of candidates) {
    // Source-of-truth payment check (covers a payment recorded via webhook only).
    const paid = await prisma.payment.findFirst({
      where: { submissionId: c.id, purpose: "assessment_unlock", status: "captured" },
      select: { id: true },
    });
    if (paid) continue;

    const claim = await prisma.submission.updateMany({
      where: { id: c.id, status: "COMPLETED", completedUnpaidAt: null, completedPaidAt: null },
      data: { completedUnpaidAt: new Date() },
    });
    if (claim.count === 0) continue; // paid/handled in the meantime

    try {
      const input = await loadCompletionInput(c.id);
      if (input) await emitEvent(EventType.ASSESSMENT_COMPLETED_UNPAID, input);
      swept++;
    } catch {
      // Roll back so the next sweep retries this submission.
      await prisma.submission.updateMany({ where: { id: c.id }, data: { completedUnpaidAt: null } }).catch(() => {});
    }
  }

  return { swept, scanned: candidates.length };
}
