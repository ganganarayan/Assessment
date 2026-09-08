/**
 * Format an instant as "DD-MM-YYYY HH:MM" in IST (UTC+5:30, no DST).
 *
 * Uses a fixed manual offset rather than Intl/timeZone so the result is correct
 * regardless of the server's locale or ICU timezone data (Railway/Node).
 */
export function formatIST(d: Date | string): string {
  const ms = new Date(d).getTime() + 5.5 * 60 * 60 * 1000;
  const [date, time] = new Date(ms).toISOString().slice(0, 16).split("T");
  const [y, m, day] = date!.split("-");
  return `${day}-${m}-${y} ${time}`;
}

const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

/**
 * Convert IST (UTC+5:30) calendar dates (DD-MM-YYYY) from a date-range picker into
 * UTC instant bounds for a DB query (createdAt is stored UTC). `to` is inclusive to
 * end-of-day. Invalid/blank inputs are ignored; if from > to they swap, so picking
 * the same date for both yields that single full day.
 */
export function istDateRangeToUtc(
  from?: string | null,
  to?: string | null,
): { gte: Date | null; lte: Date | null } {
  const parse = (s: string | null | undefined, end: boolean): Date | null => {
    const m = s ? DATE_RE.exec(s.trim()) : null;
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = new Date(`${yyyy}-${mm}-${dd}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  let gte = parse(from, false);
  let lte = parse(to, true);
  if (gte && lte && gte.getTime() > lte.getTime()) {
    gte = parse(to, false);
    lte = parse(from, true);
  }
  return { gte, lte };
}
