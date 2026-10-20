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
