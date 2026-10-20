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

/**
 * How late is too late to still send a message.
 *
 * 🔴 WHY THIS EXISTS AT ALL. A run that cannot send stays PENDING on purpose, so it goes
 * out late rather than never: that is right for a deploy, a crash or a few minutes of
 * Google being down. It is badly wrong for a long pause. A feature held back for a week
 * and then released, or a scheduler stopped over a weekend, would otherwise release the
 * whole backlog at once - and every one of those reminders says "your call is tomorrow"
 * about a call that happened last Tuesday. The person reads it as the business being
 * broken, which it is.
 *
 * Six hours: long enough that an ordinary outage still delivers, short enough that
 * nothing arrives describing a day that has already gone.
 */
export const STALE_AFTER_MS = 6 * 60 * 60_000;

/** True when a run is so far past its due time that sending it would misinform. */
export function isStale(dueAt: Date, nowMs: number): boolean {
  return nowMs - dueAt.getTime() > STALE_AFTER_MS;
}

/** How much automation history is kept. Everything older is deleted by the sweep. */
export const RETENTION_DAYS = 30;

/**
 * The run states the retention sweep is allowed to delete.
 *
 * 🔴 PENDING AND SENDING ARE NOT HERE, AND MUST NEVER BE. A reminder for a call three
 * months out is queued the day the call is booked, so its row is older than the cutoff
 * long before it is due. Sweeping by age alone would delete tomorrow's reminders, and
 * nothing anywhere would say why they never arrived. Expressed as a list here, in a
 * module with no database in it, so the rule can be checked rather than trusted.
 */
export const PRUNABLE_RUN_STATUSES = ["SENT", "FAILED", "SKIPPED", "CANCELLED"] as const;

/** The instant before which history is deleted. */
export function retentionCutoff(nowMs: number): Date {
  return new Date(nowMs - RETENTION_DAYS * 86_400_000);
}

/**
 * Which triggers are OUTREACH, and therefore stop at a do-not-disturb flag.
 *
 * 🔴 The line, and the reasoning, because somebody will be tempted to move it.
 *
 * A person who booked a call asked for every message ABOUT that call. Withholding "your
 * call moved to Friday" from somebody who once unsubscribed from a newsletter is not
 * honouring consent; it is making them miss an appointment they chose, and they will
 * rightly blame the business. So the booking's own messages - the confirmation, the
 * reschedule, the cancellation, the reminder - always send.
 *
 * The two follow-ups are different. "You did not show up, here is another slot" and
 * "great speaking, here is my offer" are outreach that happens to be triggered by a
 * calendar, and somebody who has said stop has said stop to those.
 *
 * Pure and listed here rather than decided inside the sender so the rule can be checked
 * by verify:automations instead of trusted.
 */
export const SUPPRESSIBLE_TRIGGERS = ["APPOINTMENT_ATTENDED", "APPOINTMENT_NO_SHOW"] as const;

/** True when this trigger's messages must not reach a suppressed contact. */
export function respectsSuppression(trigger: string): boolean {
  return (SUPPRESSIBLE_TRIGGERS as readonly string[]).includes(trigger);
}
