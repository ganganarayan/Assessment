import { prisma } from "@/lib/db/prisma";
import { deliverWebhook } from "@/lib/webhooks/dispatch";

/**
 * Durable webhook delivery: process a queued WebhookDelivery row. Used both for
 * the inline first attempt (from emitEvent) and the retry cron. Lease-claims the
 * row so a concurrent worker can't double-send, retries failures with backoff, and
 * gives up after the schedule is exhausted. deliverWebhook still writes the
 * per-attempt WebhookLog, so the audit trail is unchanged.
 */

// Delay before the NEXT retry, indexed by the attempt that just failed (1-based):
// attempt 1 fails -> +2m, 2 -> +5m, 3 -> +15m, 4 -> +30m, 5 -> +60m; a 6th failure
// marks the delivery dead.
const BACKOFF_MS = [2, 5, 15, 30, 60].map((m) => m * 60_000);
// A claimed row is leased forward this long. If the worker dies mid-attempt the row
// becomes due again on its own (no stuck "sending" state to reclaim).
const LEASE_MS = 120_000;

export async function processDelivery(id: string): Promise<void> {
  const now = new Date();
  // Lease-claim: take only a DUE, pending row and push nextAttemptAt forward so a
  // concurrent worker (inline vs cron) skips it. Status stays "pending", so a crash
  // after claiming self-heals when the lease expires.
  const claim = await prisma.webhookDelivery.updateMany({
    where: { id, status: "pending", nextAttemptAt: { lte: now } },
    data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (claim.count === 0) return;

  const d = await prisma.webhookDelivery.findUnique({ where: { id } });
  if (!d) return;

  // Don't deliver to a webhook the user has since removed or paused.
  const wh = await prisma.webhook.findUnique({ where: { id: d.webhookId }, select: { status: true } });
  if (!wh || wh.status !== "ACTIVE") {
    await prisma.webhookDelivery
      .update({ where: { id }, data: { status: "dead", lastError: "webhook removed or inactive" } })
      .catch(() => {});
    return;
  }

  const attempt = d.attemptCount + 1;
  const res = await deliverWebhook({
    url: d.endpoint,
    secret: d.secret,
    eventName: d.eventName,
    body: d.body,
    webhookId: d.webhookId,
    submissionId: d.submissionId,
    tenantId: d.tenantId,
    attempt,
  });

  if (res.success) {
    await prisma.webhookDelivery
      .update({
        where: { id },
        data: { status: "delivered", attemptCount: attempt, deliveredAt: new Date(), lastStatus: res.responseStatus, lastError: null },
      })
      .catch(() => {});
    return;
  }

  const backoff = BACKOFF_MS[attempt - 1];
  await prisma.webhookDelivery
    .update({
      where: { id },
      data:
        backoff === undefined
          ? { status: "dead", attemptCount: attempt, lastStatus: res.responseStatus }
          : { status: "pending", attemptCount: attempt, nextAttemptAt: new Date(Date.now() + backoff), lastStatus: res.responseStatus },
    })
    .catch(() => {});
}

/** Process a batch of due deliveries (the retry cron). */
export async function retryPendingWebhooks(limit = 100): Promise<{ processed: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const row of due) {
    await processDelivery(row.id).catch(() => {});
  }
  return { processed: due.length };
}
