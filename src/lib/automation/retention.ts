import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Thirty days of automation history, and not a row more.
 *
 * Why there is a limit at all: this is the highest-write table the product has. One
 * booking with a confirmation and two reminders is four rows, times thousands of
 * tenants, forever. Kept unbounded it becomes the biggest table in the database within a
 * year, and the only thing anybody ever reads is the last few weeks.
 *
 * What survives the sweep: the LIFETIME counters on each action. So "sent 1,482 of these
 * since you wrote it" stays true while the individual rows behind the first 1,400 are
 * long gone, and the owner is never shown a number that quietly resets every month.
 */

import { PRUNABLE_RUN_STATUSES, RETENTION_DAYS, retentionCutoff } from "@/lib/automation/schedule";

export { RETENTION_DAYS };

/** Delete in slices rather than one statement: a single DELETE over a month of a busy
 *  install holds locks on a table the sender is writing to. */
const SLICE = 1000;
const MAX_SLICES = 20;

export interface PruneSummary {
  runs: number;
  sends: number;
}

export async function pruneAutomationHistory(now = Date.now()): Promise<PruneSummary> {
  const cutoff = retentionCutoff(now);
  const summary: PruneSummary = { runs: 0, sends: 0 };

  for (let i = 0; i < MAX_SLICES; i++) {
    const old = await prisma.automationSend.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: SLICE,
    });
    if (old.length === 0) break;
    const { count } = await prisma.automationSend.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
    summary.sends += count;
    if (old.length < SLICE) break;
  }

  for (let i = 0; i < MAX_SLICES; i++) {
    const old = await prisma.automationRun.findMany({
      where: {
        createdAt: { lt: cutoff },
        // Terminal rows only - see PRUNABLE_RUN_STATUSES for why that is not negotiable.
        status: { in: [...PRUNABLE_RUN_STATUSES] },
      },
      select: { id: true },
      take: SLICE,
    });
    if (old.length === 0) break;
    const { count } = await prisma.automationRun.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
    summary.runs += count;
    if (old.length < SLICE) break;
  }

  return summary;
}
