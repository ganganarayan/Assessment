import "server-only";
import { prisma } from "@/lib/db/prisma";
import { sendScoreUpdate } from "@/lib/crm/send";

/**
 * Background CRM resend drip. Sends one FROZEN, queued contact at a time to the
 * CRM endpoint, then waits a fresh random 10-12 minutes before the next (WhatsApp
 * sends throttle, so the gap is generous). Runs in-process (the persistent Node
 * server keeps the floating promise alive) so the admin can close the page.
 *
 * Survives deploys/restarts: instrumentation calls resumeDripOnBoot() on every
 * server start, which re-arms the loop whenever a batch was left active. Only rows
 * with crmQueuedAt set are sent, so a batch sends exactly the set frozen at Start,
 * never contacts dirtied afterwards. Assumes a single replica (the project runs 1).
 */

let running = false;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** A fresh random delay in [10 min, 12 min]. */
const nextDelayMs = () => Math.round((600 + Math.random() * 120) * 1000);

/** Sleep in short steps so a Stop request is honored within ~15s, not after the
 *  full 10-12 minute gap. */
async function interruptibleSleep(ms: number): Promise<void> {
  const step = 15_000;
  let waited = 0;
  while (waited < ms && running) {
    await sleep(Math.min(step, ms - waited));
    waited += step;
  }
}

/** Where-clause for the frozen, still-to-send batch. */
const PENDING_WHERE = {
  status: "COMPLETED" as const,
  crmDirty: true,
  crmQueuedAt: { not: null },
  crmAttempts: { lt: MAX_ATTEMPTS },
};

export function isDripRunning(): boolean {
  return running;
}

async function loop(): Promise<void> {
  try {
    while (running) {
      const next = await prisma.submission.findFirst({
        where: PENDING_WHERE,
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!next) break; // batch drained

      const res = await sendScoreUpdate(next.id);
      if (res.ok) {
        await prisma.submission.update({
          where: { id: next.id },
          data: { crmDirty: false, crmSentAt: new Date(), crmLastError: null, crmAttempts: 0, crmQueuedAt: null },
        });
      } else {
        await prisma.submission.update({
          where: { id: next.id },
          data: { crmAttempts: { increment: 1 }, crmLastError: (res.error ?? "send failed").slice(0, 500) },
        });
        // Once it has exhausted retries, unqueue it: it drops out of the batch
        // (still reported as failed via crmDirty + attempts) and never blocks a
        // future Start from freezing a fresh batch. Retry-failed re-queues it.
        await prisma.submission.updateMany({
          where: { id: next.id, crmAttempts: { gte: MAX_ATTEMPTS } },
          data: { crmQueuedAt: null },
        });
      }

      if (!running) break;
      await interruptibleSleep(nextDelayMs());
    }
  } catch {
    // Never let the loop throw; it simply ends and can be restarted/resumed.
  } finally {
    running = false;
    await prisma.appSetting
      .update({ where: { id: "singleton" }, data: { crmDripActive: false } })
      .catch(() => {});
  }
}

/** Start (or no-op if already running in this process). */
export async function startDrip(): Promise<void> {
  if (running) return;
  running = true;
  await prisma.appSetting
    .update({ where: { id: "singleton" }, data: { crmDripActive: true } })
    .catch(() => {});
  void loop();
}

/** Request stop; the loop exits after the current send/wait completes. */
export function stopDrip(): void {
  running = false;
}

/**
 * Called on server boot (instrumentation). If a batch was left active (the flag is
 * on and queued rows remain), re-arm the loop so a deploy/restart never strands a
 * drip. Clears the flag if there's nothing left to send.
 */
export async function resumeDripOnBoot(): Promise<void> {
  if (running) return;
  try {
    const s = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { crmDripActive: true },
    });
    if (!s?.crmDripActive) return;
    const pending = await prisma.submission.count({ where: PENDING_WHERE });
    if (pending > 0) {
      running = true;
      void loop();
    } else {
      await prisma.appSetting
        .update({ where: { id: "singleton" }, data: { crmDripActive: false } })
        .catch(() => {});
    }
  } catch {
    // Boot resume is best-effort; the admin can always click Start.
  }
}
