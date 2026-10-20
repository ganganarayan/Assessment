/**
 * Slot arithmetic for the booking calendar. PURE: no DB, no env, no next/headers, so
 * scripts/verify-calendar.ts can prove it without a server or a database.
 *
 * Everything here is integer minutes against a FIXED IST offset, never the host's
 * timezone. Railway runs UTC, so "10:00 on Tuesday" resolved through the runtime would
 * be 10:00 UTC - half past three in the afternoon for the person who typed it. The same
 * reasoning as formatIST in src/lib/date.ts, and the reason availability is stored as
 * minutes-from-midnight plus a weekday rather than as timestamps.
 *
 * The vocabulary, once:
 *   dateKey   an IST calendar date, "YYYY-MM-DD". What a respondent picks.
 *   minutes   minutes from IST midnight. 0 = 00:00, 570 = 09:30, 1440 = midnight.
 *   window    a continuous span of bookable minutes on one date.
 *   busy      an instant range already taken, in epoch ms (UTC).
 */

/** IST is UTC+5:30 and has no DST, which is what makes a fixed offset correct here. */
export const IST_OFFSET_MIN = 330;
const MS_PER_MIN = 60_000;
const MINUTES_PER_DAY = 1440;

export interface AvailabilityWindow {
  startMin: number;
  endMin: number;
}

/** One recurring weekly window. weekday: 0 = Sunday through 6 = Saturday, IST. */
export interface SlotRuleInput {
  weekday: number;
  startMin: number;
  endMin: number;
}

/**
 * A one-date change to the weekly pattern. A BLOCK with null times is the whole day
 * off; an OPEN with null times is the whole day open (00:00 to 24:00).
 */
export interface SlotExceptionInput {
  dateKey: string;
  kind: "BLOCK" | "OPEN";
  startMin: number | null;
  endMin: number | null;
}

/** An instant range that is already taken (another booking, or blocked-out time). */
export interface BusyInput {
  startMs: number;
  endMs: number;
}

export interface Slot {
  startMs: number;
  endMs: number;
}

export interface DaySlotInput {
  dateKey: string;
  rules: SlotRuleInput[];
  exceptions: SlotExceptionInput[];
  /** Every live appointment in the workspace, not just this booking type's: one shared
   *  calendar means a call sold through another booking type still takes the time. */
  busy: BusyInput[];
  durationMin: number;
  bufferMin: number;
  /** 0 = step by duration + buffer, which is the everyday case. */
  slotStepMin: number;
  noticeMin: number;
  nowMs: number;
  horizonDays: number;
  maxPerDay: number | null;
  /** Live bookings already held on this IST date, for the per-day cap. */
  bookedCountOnDay: number;
}

/* ------------------------------------------------------------------ dates --- */

/** The IST calendar date of an instant, as "YYYY-MM-DD". */
export function istDateKey(ms: number): string {
  return new Date(ms + IST_OFFSET_MIN * MS_PER_MIN).toISOString().slice(0, 10);
}

/** Minutes past IST midnight for an instant. */
export function istMinutesOfDay(ms: number): number {
  const shifted = new Date(ms + IST_OFFSET_MIN * MS_PER_MIN);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** True for a well-formed "YYYY-MM-DD" that names a real date. */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** The instant (epoch ms, UTC) at `minutes` past IST midnight on an IST date. */
export function utcMsFor(dateKey: string, minutes: number): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`) + (minutes - IST_OFFSET_MIN) * MS_PER_MIN;
}

/** 0 = Sunday through 6 = Saturday, for an IST date. */
export function istWeekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

/** The IST date `days` after (or before, when negative) the given one. */
export function addDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + days * MINUTES_PER_DAY * MS_PER_MIN)
    .toISOString()
    .slice(0, 10);
}

/** Every IST date the public page may offer, today first. */
export function horizonDateKeys(nowMs: number, horizonDays: number): string[] {
  const first = istDateKey(nowMs);
  const span = Math.max(1, Math.min(horizonDays, 400));
  return Array.from({ length: span }, (_, i) => addDays(first, i));
}

/** "09:30" from 570. Used by the availability editor and the slot buttons. */
export function minutesToHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 570 from "09:30". Null when it is not a time, so a caller can reject rather than
 *  silently book midnight. "24:00" is accepted as the end of a day (1440). */
export function hhmmToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(mins) || mins > 59) return null;
  const total = hours * 60 + mins;
  return total >= 0 && total <= MINUTES_PER_DAY ? total : null;
}

/* ---------------------------------------------------------------- windows --- */

/** Merge overlapping or touching windows into the fewest spans, in order. */
function mergeWindows(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  const sorted = [...windows]
    .filter((w) => w.endMin > w.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  const out: AvailabilityWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, w.endMin);
    } else {
      out.push({ ...w });
    }
  }
  return out;
}

/** Cut a span out of each window, which can split one window into two. */
function subtract(windows: AvailabilityWindow[], cut: AvailabilityWindow): AvailabilityWindow[] {
  const out: AvailabilityWindow[] = [];
  for (const w of windows) {
    if (cut.endMin <= w.startMin || cut.startMin >= w.endMin) {
      out.push(w);
      continue;
    }
    if (cut.startMin > w.startMin) out.push({ startMin: w.startMin, endMin: cut.startMin });
    if (cut.endMin < w.endMin) out.push({ startMin: cut.endMin, endMin: w.endMin });
  }
  return out;
}

/**
 * The bookable windows on one IST date: the weekly rules for that weekday, plus any
 * OPEN exception for the date, minus every BLOCK exception for it.
 *
 * Order matters and is deliberate. BLOCK is applied LAST, so a day off beats a window
 * that was opened for it: "I am away on the 26th" has to win over any rule, including
 * one added later, or a holiday silently leaks slots.
 */
export function windowsForDate(
  dateKey: string,
  rules: SlotRuleInput[],
  exceptions: SlotExceptionInput[],
): AvailabilityWindow[] {
  const mine = exceptions.filter((e) => e.dateKey === dateKey);
  const weekday = istWeekday(dateKey);

  const opens = mine
    .filter((e) => e.kind === "OPEN")
    .map((e) => ({
      startMin: e.startMin ?? 0,
      endMin: e.endMin ?? MINUTES_PER_DAY,
    }));

  let windows = mergeWindows([
    ...rules.filter((r) => r.weekday === weekday).map((r) => ({ startMin: r.startMin, endMin: r.endMin })),
    ...opens,
  ]);

  for (const block of mine.filter((e) => e.kind === "BLOCK")) {
    windows = subtract(windows, {
      startMin: block.startMin ?? 0,
      endMin: block.endMin ?? MINUTES_PER_DAY,
    });
  }
  return windows;
}

/* ------------------------------------------------------------------ slots --- */

function overlapsBusy(slot: Slot, busy: BusyInput[], bufferMs: number): boolean {
  // The buffer is dead time around a booking that nothing else may take, so it is
  // added to BOTH sides of what is already in the diary and to the end of the
  // candidate. Without the leading side, a 30-minute call with a 15-minute buffer
  // could still be booked to start the moment the previous one ended.
  return busy.some((b) => slot.startMs < b.endMs + bufferMs && b.startMs - bufferMs < slot.endMs);
}

/**
 * Every slot that can still be booked on one IST date.
 *
 * Returns [] rather than throwing for every ordinary "nothing here" case: a date in the
 * past, past the horizon, a day with no rules, a day at its cap. The public page shows
 * dates with slots and stays quiet about the rest.
 */
export function daySlots(input: DaySlotInput): Slot[] {
  const {
    dateKey,
    rules,
    exceptions,
    busy,
    durationMin,
    bufferMin,
    slotStepMin,
    noticeMin,
    nowMs,
    horizonDays,
    maxPerDay,
    bookedCountOnDay,
  } = input;

  if (!isDateKey(dateKey) || durationMin <= 0) return [];
  if (maxPerDay != null && bookedCountOnDay >= maxPerDay) return [];

  const todayKey = istDateKey(nowMs);
  const lastKey = addDays(todayKey, Math.max(0, horizonDays - 1));
  if (dateKey < todayKey || dateKey > lastKey) return [];

  const step = slotStepMin > 0 ? slotStepMin : durationMin + bufferMin;
  if (step <= 0) return [];

  // The earliest a respondent may book. The notice window is why a slot an hour from
  // now is not offered on a booking type that asks for a day's warning.
  const earliestMs = nowMs + Math.max(0, noticeMin) * MS_PER_MIN;
  const bufferMs = Math.max(0, bufferMin) * MS_PER_MIN;

  const slots: Slot[] = [];
  for (const window of windowsForDate(dateKey, rules, exceptions)) {
    for (let min = window.startMin; min + durationMin <= window.endMin; min += step) {
      const startMs = utcMsFor(dateKey, min);
      const endMs = startMs + durationMin * MS_PER_MIN;
      if (startMs < earliestMs) continue;
      if (overlapsBusy({ startMs, endMs }, busy, bufferMs)) continue;
      slots.push({ startMs, endMs });
    }
  }
  return slots.sort((a, b) => a.startMs - b.startMs);
}

/**
 * WHICH CALENDAR a booking belongs to: a staff member's own, or the workspace's shared
 * one when nobody is assigned.
 *
 * One string, used as half of the double-booking key and as the filter on busy time, so
 * the two can never disagree about what "the same diary" means.
 */
export function calendarKey(tenantId: string, assignedUserId: string | null | undefined): string {
  return `${tenantId}:${calendarOwnerKey(assignedUserId)}`;
}

/** A slot on a team link, and who is actually free to take it. */
export interface TeamSlot extends Slot {
  /** Member ids free at this instant, in no particular order. Never empty. */
  freeOwners: string[];
}

/**
 * Merge one slot list per team member into one list for the link.
 *
 * A slot survives while ANYBODY is free, which is the whole point of a team page: three
 * people means the eleven o'clock stays bookable until all three are taken. Each slot
 * carries who is free, because the booking that follows has to be handed to one of them
 * and the page must not offer a time nobody can actually take.
 *
 * PURE, so scripts/verify-calendar.ts can prove the union and the capacity.
 */
export function mergeOwnerSlots(perOwner: { owner: string; slots: Slot[] }[]): TeamSlot[] {
  const byStart = new Map<number, TeamSlot>();
  for (const { owner, slots } of perOwner) {
    for (const s of slots) {
      const existing = byStart.get(s.startMs);
      if (existing) {
        if (!existing.freeOwners.includes(owner)) existing.freeOwners.push(owner);
      } else {
        byStart.set(s.startMs, { startMs: s.startMs, endMs: s.endMs, freeOwners: [owner] });
      }
    }
  }
  return [...byStart.values()].sort((a, b) => a.startMs - b.startMs);
}

/**
 * Whose turn it is, among the members free for a slot.
 *
 * 🔴 ROUND ROBIN MEANS LONGEST WAITING, not a counter modulo the team size. A counter
 * breaks the first time somebody is busy and gets skipped: the booking still advances
 * it, so the person who was skipped waits another full lap, and on a team where one
 * person has a fuller diary the rota silently drifts into never choosing them. Oldest
 * stamp first self-corrects - being skipped leaves you at the front of the queue.
 *
 * Never assigned (no stamp) sorts first, so a new member starts at the front rather
 * than waiting out everybody else's history. Equal stamps break on the member id, so
 * the answer is deterministic rather than dependent on row order.
 *
 * PURE, and the `exclude` argument is what makes the booking retry honest: when the
 * database refuses a member because somebody just took them, the next call asks for the
 * next in line rather than the same person again.
 */
export function pickRoundRobin(
  freeOwners: string[],
  lastAssignedAt: Record<string, number | null | undefined>,
  exclude: string[] = [],
): string | null {
  const candidates = freeOwners.filter((o) => !exclude.includes(o));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const at = lastAssignedAt[a] ?? -1;
    const bt = lastAssignedAt[b] ?? -1;
    if (at !== bt) return at - bt;
    return a < b ? -1 : 1;
  })[0] as string;
}

/**
 * Put the respondent's own token on a link that points at one of our booking pages.
 *
 * 🔴 WHY THE RESULT-PAGE CTA NEEDS THIS. An owner pastes /b/strategy-call into the
 * button on their result page. Without the token, the person who just finished the
 * assessment arrives at an empty form and is asked for the name, email and mobile they
 * typed two screens ago - and, worse, the booking that follows is a stranger's: no
 * submission, no score behind it, no fbp, so the Schedule event reaching Meta cannot be
 * matched to the ad that paid for the visit. With the token it is the same person all
 * the way through.
 *
 * PURE and conservative. It stamps a link only when the path is /b/<something>, leaves
 * an existing ?t= alone, and returns anything else untouched - including a link to
 * another site, which must never be handed somebody's token. A relative path is stamped
 * as-is; an absolute URL keeps its host.
 */
export function stampBookingUrl(url: string | null | undefined, resultToken: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  const token = (resultToken ?? "").trim();
  if (!token) return raw;

  // A relative link can only be our own, so it is parsed against a placeholder origin
  // and written back in the same shape it arrived.
  const relative = raw.startsWith("/");
  let u: URL;
  try {
    u = new URL(raw, relative ? "https://placeholder.invalid" : undefined);
  } catch {
    return raw;
  }
  // Only OUR booking pages. The host is not checked for an absolute URL because an
  // owner may run their own domain, and /b/<slug> on a foreign host is not a path this
  // app serves anyway - but the path shape is what decides, never the query.
  if (!/^\/b\/[^/]+\/?$/.test(u.pathname)) return raw;
  if (u.searchParams.has("t")) return raw;
  u.searchParams.set("t", token);
  return relative ? `${u.pathname}${u.search}` : u.toString();
}

/**
 * WHOSE calendar, without the workspace in front of it: a staff id, or the literal
 * "shared".
 *
 * The same string the Google connection is stored under (GoogleCalendarAccount
 * .calendarKey) and the one the connect link carries, so the screen, the booking and
 * the sync can never disagree about which diary is meant. It is "shared" rather than
 * null because it ends up in a UNIQUE index, and Postgres treats NULLs as distinct -
 * which would let one calendar be connected to two Google accounts at once.
 */
export function calendarOwnerKey(assignedUserId: string | null | undefined): string {
  return assignedUserId ?? "shared";
}

/**
 * The lock value that makes double booking impossible.
 *
 * Written into Appointment.slotLock (UNIQUE, nullable) while a booking is live and
 * nulled on cancel, so the database refuses the second of two simultaneous bookings of
 * one slot instead of both succeeding.
 *
 * 🔴 Keyed on the CALENDAR and the start instant, never on the booking type. Two staff
 * members can each take 11:00 and that is the point of per-staff calendars; one of them
 * cannot take it twice, including through two different booking links that happen to
 * sell the same person's time. The slot list already refuses that (busy time is read per
 * calendar), but a list is computed a moment before the write, and a per-link key would
 * let two links through the gap.
 *
 * 🟡 What this still does not catch: two bookings that OVERLAP without starting at the
 * same instant (10:00 to 10:30 against 10:15 to 10:45), committed in the same instant.
 * It needs two booking links on one calendar whose grids are offset and two people
 * pressing at once, and a unique index cannot express "overlaps". The slot computation
 * is the defence there.
 */
export function slotLockFor(
  tenantId: string,
  assignedUserId: string | null | undefined,
  startAt: Date | number,
): string {
  const ms = startAt instanceof Date ? startAt.getTime() : startAt;
  return `${calendarKey(tenantId, assignedUserId)}:${new Date(ms).toISOString()}`;
}
