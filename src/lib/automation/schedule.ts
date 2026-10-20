/**
 * When an automation is due. PURE: no DB, no env, no server-only, so
 * scripts/verify-automations.ts can prove it without a database.
 *
 * It is three lines of arithmetic, and it is in its own module for the reason the slot
 * maths is: an offset applied with the wrong sign produces a perfectly plausible row
 * that sends "your call is tomorrow" an hour after the call, and the only way to catch
 * that is a test that can run anywhere.
 */

/**
 * The due time for a reminder: the call's start, shifted by the automation's offset.
 * Negative minutes are before the call, positive after it.
 */
export function reminderDueAt(startAt: Date, offsetMin: number): Date {
  return new Date(startAt.getTime() + offsetMin * 60_000);
}

/**
 * Should this reminder be queued at all?
 *
 * False when it is already in the past, which happens whenever somebody books a call
 * sooner than the reminder's own lead time. Sending it anyway would tell a person whose
 * call is in two hours that it is tomorrow, and leaving the row PENDING in the past
 * would make the cron do exactly that the next time it ran.
 */
export function isStillAhead(dueAt: Date, nowMs: number): boolean {
  return dueAt.getTime() > nowMs;
}
