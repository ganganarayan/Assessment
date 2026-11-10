/**
 * Timezones for what a RESPONDENT sees (Phase 4). Pure: no server imports, so the slot
 * maths, client components and the verify scripts share one copy.
 *
 * Admin screens never use this; they stay IST through formatIST (owner rule).
 */
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/** Is this a zone the runtime knows? Never throws. */
export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (!zone || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){1,2})$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function zoneOr(zone: string | null | undefined): string {
  return isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(zone, f);
  }
  return f;
}

/** The zone's offset from UTC, in minutes, at this instant (DST-aware). */
export function zoneOffsetMin(zone: string, utcMs: number): number {
  const p: Record<string, number> = {};
  for (const part of partsFormatter(zone).formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year ?? 1970, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** DD-MM-YYYY HH:MM in the zone (24-hour), the house format for a human-read time. */
export function formatInZone(d: Date | string | number, zone: string): string {
  const ms = new Date(d).getTime();
  const shifted = new Date(ms + zoneOffsetMin(zone, ms) * 60000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(shifted.getUTCDate())}-${pad(shifted.getUTCMonth() + 1)}-${shifted.getUTCFullYear()} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** DD-MM-YYYY in the zone. */
export function formatDateInZone(d: Date | string | number, zone: string): string {
  return formatInZone(d, zone).slice(0, 10);
}

/** A short label for the zone, e.g. "IST", or "EST" / "GMT-5", for "10:30 (IST)". */
export function zoneLabel(zone: string, atMs: number = Date.now()): string {
  if (zone === DEFAULT_TIME_ZONE) return "IST";
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
      .formatToParts(new Date(atMs))
      .find((p) => p.type === "timeZoneName")?.value;
    return name || zone;
  } catch {
    return zone;
  }
}

/** Zones offered in Settings, common ones first. */
export const COMMON_TIME_ZONES: readonly string[] = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];
