import { type WorkflowDelayUnit } from "@prisma/client";

/**
 * When a delayed step is due.
 *
 * A PLAIN module, no DB and no server-only, so the builder can show "due 3 days after
 * they opt in" using the same arithmetic the worker will use. One implementation, so
 * the preview cannot promise a date the queue then disagrees with.
 */

/**
 * Add a delay to an instant.
 *
 * 🔴 MONTHS are calendar months, which is why the unit survives all the way here
 * instead of being flattened into minutes when it was typed. "One month after they
 * opted in" means the same date next month; 43,200 minutes means something between
 * three days early and three days late depending on where in the year it lands, and
 * the drift compounds over a six-step sequence.
 *
 * The clamp handles the only ugly case: adding a month to the 31st. JavaScript rolls
 * 31 January into 3 March, which would put a step a week past where anybody expects
 * it, so a month that is too short lands on its last day instead.
 */
export function dueAfter(from: Date, amount: number, unit: WorkflowDelayUnit): Date {
  const n = Math.max(0, Math.floor(amount));
  const d = new Date(from.getTime());
  switch (unit) {
    case "MINUTES":
      return new Date(d.getTime() + n * 60_000);
    case "HOURS":
      return new Date(d.getTime() + n * 3_600_000);
    case "DAYS":
      return new Date(d.getTime() + n * 86_400_000);
    case "MONTHS": {
      const day = d.getUTCDate();
      const target = new Date(d.getTime());
      target.setUTCDate(1);
      target.setUTCMonth(target.getUTCMonth() + n);
      // Last day of the target month, so the 31st never rolls into the next one.
      const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      target.setUTCDate(Math.min(day, last));
      return target;
    }
    default:
      return d;
  }
}

/** "3 days", "1 month" - for the builder and the run log. Singular when it is one. */
export function describeDelay(amount: number | null | undefined, unit: WorkflowDelayUnit | null | undefined): string {
  if (!amount || !unit) return "no wait";
  const n = Math.max(0, Math.floor(amount));
  const word = unit.toLowerCase().replace(/s$/, "");
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * How long after its due time a MESSAGE step is still worth sending.
 *
 * Deliberately NOT imported from the automation engine, which has its own copy and a
 * much shorter window. The two are different problems: a reminder announcing a call
 * that happened last Tuesday is actively harmful, while a nurture message that is a
 * day late is merely late. Sharing one constant across the two engines is also how two
 * engines quietly become one.
 *
 * Three days, because the realistic causes of lateness here are a cron that stopped
 * overnight or a feature switched off and back on, and a sequence step is rarely
 * anchored to a moment the way an appointment is. Long enough to survive an outage,
 * short enough that a month-old step never lands.
 *
 * The enqueue gate means there is no backlog to flood from: new runs are not queued
 * while the feature is held back, so at most ONE step per paused run is ever overdue.
 */
export const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** Is this send so late that it should be recorded rather than sent? */
export function isStale(dueAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - dueAt.getTime() > STALE_AFTER_MS;
}

/**
 * Retention windows, kept HERE rather than beside the sweep that uses them.
 *
 * The sweep imports prisma and is server-only, which means anything importing it needs
 * the react-server condition to resolve. A build-chain check should not depend on a
 * flag being remembered, so the numbers live in this pure module and the sweep
 * re-exports them: one definition, importable from anywhere.
 *
 * The rule they encode is DUE TIME and never age. A run created today for a step due
 * in March is thirty days old next month and perfectly valid; a send time a month in
 * the past is dead whatever the status says.
 */
const DAY_MS = 86_400_000;

/** A due time this far in the past belongs to a run nobody is still waiting on. */
export const DEAD_AFTER_MS = 30 * DAY_MS;
/** How long a finished run is kept, so the owner can still see what happened. */
export const TERMINAL_KEEP_MS = 90 * DAY_MS;
/** What the schema promises for the per-send log. */
export const SEND_KEEP_MS = 30 * DAY_MS;
