import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Keeping the workflow tables from growing forever.
 *
 * This exists because the schema already promised it. workflow_send says "kept for 30
 * days" and nothing was deleting anything, which makes the comment a lie and the table
 * a slow leak on a high-write path.
 *
 * 🔴 THE RULE IS DUE TIME, NEVER AGE, and getting that backwards is the whole danger.
 * A run created today for a step due in March is thirty days old next month and
 * perfectly valid; deleting by age would silently cancel somebody's sequence. A send
 * time a month in the past, by contrast, is dead whatever the status says, and
 * anything genuinely upcoming has a future due time, so the rule cannot touch it.
 *
 * The case that makes this necessary: a tenant held back from the feature has their
 * runs skipped before the claim, so those rows stay PENDING forever. They can never
 * become terminal, so a sweep that only deleted finished rows would never reach them -
 * unbounded growth created by a switch nobody thinks of as a data decision.
 */

const DAY_MS = 86_400_000;

/** A due time this far in the past belongs to a run nobody is still waiting on. */
export const DEAD_AFTER_MS = 30 * DAY_MS;
/** How long a finished run is kept, so the owner can still see what happened. */
export const TERMINAL_KEEP_MS = 90 * DAY_MS;
/** What the schema promises for the per-send log. */
export const SEND_KEEP_MS = 30 * DAY_MS;

export interface SweepOutcome {
  deadRuns: number;
  deletedRuns: number;
  deletedSends: number;
}

export async function sweepWorkflowRetention(now: Date = new Date()): Promise<SweepOutcome> {
  // 1. Runs long past their send time that never terminated. Cancelled with a reason
  //    rather than deleted outright: the owner asking "why did these people stop
  //    halfway" deserves an answer, and the terminal sweep below collects them later.
  const dead = await prisma.workflowRun.updateMany({
    where: {
      status: { in: ["PENDING", "SENDING"] },
      dueAt: { lt: new Date(now.getTime() - DEAD_AFTER_MS) },
    },
    data: {
      status: "CANCELLED",
      stopReason: "Overdue by more than 30 days - the sequence was not running.",
      finishedAt: now,
    },
  });

  // 2. Terminal runs, by DUE time rather than created time, which keeps the sweep on
  //    the (status, dueAt) index and means a long sequence is never cut short.
  const deleted = await prisma.workflowRun.deleteMany({
    where: {
      status: { in: ["DONE", "FAILED", "CANCELLED"] },
      dueAt: { lt: new Date(now.getTime() - TERMINAL_KEEP_MS) },
    },
  });

  // 3. The per-send log, which is what the schema comment was talking about. The
  //    lifetime counters on the step are NOT touched: "sent 1,482 of these since you
  //    wrote it" and "here are the last 30 days" are different questions.
  const sends = await prisma.workflowSend.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - SEND_KEEP_MS) } },
  });

  return { deadRuns: dead.count, deletedRuns: deleted.count, deletedSends: sends.count };
}
