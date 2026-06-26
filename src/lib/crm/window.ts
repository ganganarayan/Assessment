/**
 * Pure time-window + delay helpers for the throttled CRM senders. IST is a fixed
 * UTC+5:30 offset with no DST, so the IST hour is pure arithmetic on the UTC epoch
 * — no timezone library, and the Railway server's own TZ is irrelevant.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The hour (0-23) in IST for a given instant. */
export function istHour(now: Date = new Date()): number {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
}

/**
 * Is `hour` inside the daily window [start, end)? `start === end` means 24h (always
 * open). `end < start` is an overnight window (e.g. 21 -> 6).
 */
export function inWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return true;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** ms from `now` until the next time the IST clock reaches `startHour:00`. */
export function msUntilWindowOpen(now: Date, startHour: number): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const target = new Date(ist.getTime());
  target.setUTCHours(startHour, 0, 0, 0);
  if (target.getTime() <= ist.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - ist.getTime();
}

/** A fresh random delay in [minMinutes, maxMinutes], in ms. */
export function randomDelayMs(minMinutes: number, maxMinutes: number): number {
  const lo = Math.max(0, minMinutes);
  const hi = Math.max(lo, maxMinutes);
  return Math.round((lo * 60 + Math.random() * (hi - lo) * 60) * 1000);
}
