import "server-only";
import { prisma } from "@/lib/db/prisma";
import { sendScoreUpdate } from "@/lib/crm/send";

/**
 * Background CRM resend drip. Sends one "dirty" contact at a time to the CRM
 * endpoint, then waits a FRESH random 120–180s before the next, so no two gaps
 * are identical. Runs in-process (the persistent Node server keeps the floating
 * promise alive across requests) so the admin can close the page.
 *
 * A deploy/restart ends the loop (NO auto-resume). The persisted crmDripActive
 * flag lets the status surface "interrupted — click Start to resume," and Start
 * simply re-arms from the remaining dirty rows. Assumes a single replica (the
 * project runs 1); the module-level `running` flag prevents a double-start within
 * one process.
 */

let running = false;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** A fresh random delay in [120s, 180s]. */
const nextDelayMs = () => Math.round((120 + Math.random() * 60) * 1000);

export function isDripRunning(): boolean {
  return running;
}

async function loop(): Promise<void> {
  try {
    while (running) {
      const next = await prisma.submission.findFirst({
        where: { crmDirty: true, crmAttempts: { lt: MAX_ATTEMPTS } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!next) break; // queue drained

      const res = await sendScoreUpdate(next.id);
      if (res.ok) {
        await prisma.submission.update({
          where: { id: next.id },
          data: { crmDirty: false, crmSentAt: new Date(), crmLastError: null, crmAttempts: 0 },
        });
      } else {
        // Keep it dirty; once attempts hit MAX_ATTEMPTS it drops out of the queue
        // (reported as failed) so one bad contact never blocks the rest.
        await prisma.submission.update({
          where: { id: next.id },
          data: { crmAttempts: { increment: 1 }, crmLastError: (res.error ?? "send failed").slice(0, 500) },
        });
      }

      if (!running) break;
      await sleep(nextDelayMs());
    }
  } catch {
    // Never let the loop throw; it simply ends and can be restarted.
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
