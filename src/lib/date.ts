/**
 * Format an instant as "YYYY-MM-DD HH:MM" in IST (UTC+5:30, no DST).
 *
 * Uses a fixed manual offset rather than Intl/timeZone so the result is correct
 * regardless of the server's locale or ICU timezone data (Railway/Node).
 */
export function formatIST(d: Date | string): string {
  const ms = new Date(d).getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}
