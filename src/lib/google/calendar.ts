import "server-only";
import { prisma } from "@/lib/db/prisma";
import { accessTokenFor } from "@/lib/google/oauth";
import { calendarOwnerKey } from "@/lib/calendar/slots";

/**
 * Google Calendar, both directions.
 *
 * OUT: a booking becomes an event in the owner's own calendar, so it appears on their
 * phone with their own reminders, beside everything else they have on. The .ics feed
 * does a weaker version of this (a client polls it on its own schedule); a real event
 * updates when the booking moves and strikes through when it is cancelled.
 *
 * IN: free/busy, so a slot is not offered while that person already has a meeting. This
 * is the half owners actually ask for, because without it the product cheerfully books
 * them against their own dentist.
 *
 * Every call here is fail-soft and returns rather than throws: Google being unreachable
 * must never take a booking page down.
 */

const API = "https://www.googleapis.com/calendar/v3";

/**
 * The calendar key for an appointment: its staff member, or the shared calendar.
 *
 * A thin alias over the pure helper so this module's callers read as "which Google
 * connection does this booking belong to". The tenant is a parameter because every
 * caller has one to hand and dropping it would make the signature lie about scope.
 */
export function keyForAppointment(_tenantId: string, assignedUserId: string | null): string {
  return calendarOwnerKey(assignedUserId);
}

interface GoogleEventBody {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  status?: "confirmed" | "cancelled";
  attendees?: { email: string; displayName?: string }[];
}

async function call(
  token: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      const err = (data.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: `${err}`.slice(0, 300) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Put one appointment into Google, or take it back out.
 *
 * Idempotent on googleEventId: the first sync creates and records the id, every later
 * one patches that same event. A cancelled booking is PATCHED to status cancelled
 * rather than deleted, so it stays visible as a struck-through entry where the owner
 * expected a call - deleting it would make the hour look free when they had set it
 * aside, and silently remove a guest's copy.
 */
export async function syncAppointmentToGoogle(appointmentId: string): Promise<void> {
  const a = await prisma.appointment
    .findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        tenantId: true,
        assignedUserId: true,
        startAt: true,
        endAt: true,
        status: true,
        title: true,
        notes: true,
        attendeeName: true,
        attendeeEmail: true,
        googleEventId: true,
        bookingType: { select: { name: true, locationValue: true } },
      },
    })
    .catch(() => null);
  if (!a) return;

  const key = keyForAppointment(a.tenantId, a.assignedUserId);
  const auth = await accessTokenFor(a.tenantId, key);
  // Not connected, or paused. Nothing to do and nothing to report: this is the normal
  // state for every workspace that has never used Google.
  if (!auth) return;

  const what = a.bookingType?.name ?? a.title ?? "Appointment";
  const who = a.attendeeName?.trim();
  const body: GoogleEventBody = {
    summary: who ? `${what} with ${who}` : what,
    start: { dateTime: a.startAt.toISOString() },
    end: { dateTime: a.endAt.toISOString() },
    status: a.status === "CANCELLED" ? "cancelled" : "confirmed",
    ...(a.notes ? { description: a.notes } : {}),
    ...(a.bookingType?.locationValue ? { location: a.bookingType.locationValue } : {}),
  };

  const result = a.googleEventId
    ? await call(auth.token, `/calendars/${encodeURIComponent(auth.calendarId)}/events/${a.googleEventId}`, {
        method: "PATCH",
        body,
      })
    : await call(auth.token, `/calendars/${encodeURIComponent(auth.calendarId)}/events`, {
        method: "POST",
        body,
      });

  if (!result.ok) {
    await prisma.appointment
      .update({
        where: { id: a.id },
        data: {
          googleSyncError: result.error,
          // Stamped even on failure, so the sweep moves on instead of retrying the same
          // broken row every thirty seconds forever. A later edit bumps updatedAt and
          // makes it stale again, which is the natural retry.
          googleSyncedAt: new Date(),
        },
      })
      .catch(() => {});
    return;
  }

  const id = typeof result.data.id === "string" ? result.data.id : a.googleEventId;
  await prisma.appointment
    .update({
      where: { id: a.id },
      data: { googleEventId: id, googleSyncedAt: new Date(), googleSyncError: null },
    })
    .catch(() => {});
  await prisma.googleCalendarAccount
    .updateMany({
      where: { tenantId: a.tenantId, calendarKey: key },
      data: { lastSyncAt: new Date(), lastError: null },
    })
    .catch(() => {});
}

/**
 * Appointments whose Google copy is out of date: never synced, or changed since.
 *
 * This is how syncing happens at all - there is no call at each write site. One sweep
 * in the scheduler covers a booking, an owner's edit, a respondent's reschedule and a
 * cancellation with one code path, and it also catches up whatever a deploy or an
 * outage interrupted. The cost is that a booking appears in Google within about half a
 * minute rather than instantly, which for a diary entry is nothing.
 */
export async function syncDueAppointments(limit = 20): Promise<number> {
  const connected = await prisma.googleCalendarAccount
    .findMany({ where: { syncEnabled: true }, select: { tenantId: true, calendarKey: true } })
    .catch(() => []);
  if (connected.length === 0) return 0;

  const tenantIds = [...new Set(connected.map((c) => c.tenantId))];
  const due = await prisma.appointment
    .findMany({
      where: {
        tenantId: { in: tenantIds },
        // Only what is coming up, plus a little history. Back-filling a year of past
        // bookings into somebody's calendar the moment they connect would be a shock,
        // not a feature.
        startAt: { gte: new Date(Date.now() - 2 * 86_400_000) },
        OR: [{ googleSyncedAt: null }, { googleSyncedAt: { lt: prisma.appointment.fields.updatedAt } }],
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: { id: true, tenantId: true, assignedUserId: true },
    })
    .catch(() => []);

  let done = 0;
  for (const a of due) {
    // Only the calendars that are actually connected; an unconnected staff member's
    // bookings are skipped without a Google call.
    const key = keyForAppointment(a.tenantId, a.assignedUserId);
    if (!connected.some((c) => c.tenantId === a.tenantId && c.calendarKey === key)) {
      // Stamp it so the same rows are not re-read on every tick forever.
      await prisma.appointment
        .update({ where: { id: a.id }, data: { googleSyncedAt: new Date() } })
        .catch(() => {});
      continue;
    }
    await syncAppointmentToGoogle(a.id);
    done += 1;
  }
  return done;
}

/* ------------------------------------------------------------- free/busy --- */

interface BusyWindow {
  startMs: number;
  endMs: number;
}

/**
 * Busy time read from Google, cached briefly.
 *
 * The cache exists because this sits on the PUBLIC booking page: without it, every
 * respondent opening a link would cost a Google API round trip, and a popular funnel
 * would spend its rate limit on people who have not booked anything.
 */
const freeBusyCache = new Map<string, { at: number; windows: BusyWindow[] }>();
const FREEBUSY_TTL_MS = 60_000;
const FREEBUSY_MAX_ENTRIES = 2000;

/**
 * When is this calendar already busy, according to Google?
 *
 * 🟡 FAILS OPEN, and that is a deliberate trade. If Google is unreachable or the token
 * has been revoked, this returns NO busy windows, so the booking page offers its normal
 * slots and the funnel keeps working. The alternative - treating an unknown as busy -
 * means one Google outage shows every visitor an empty calendar, which is a worse
 * failure than the occasional clash the owner can move.
 */
export async function googleBusyWindows(
  tenantId: string,
  key: string,
  fromMs: number,
  toMs: number,
): Promise<BusyWindow[]> {
  const cacheKey = `${tenantId}:${key}:${Math.floor(fromMs / 86_400_000)}:${Math.floor(toMs / 86_400_000)}`;
  const hit = freeBusyCache.get(cacheKey);
  const now = Date.now();
  if (hit && now - hit.at < FREEBUSY_TTL_MS) return hit.windows;

  const auth = await accessTokenFor(tenantId, key);
  if (!auth) return [];

  const res = await call(auth.token, "/freeBusy", {
    method: "POST",
    body: {
      timeMin: new Date(fromMs).toISOString(),
      timeMax: new Date(toMs).toISOString(),
      items: [{ id: auth.calendarId }],
    },
  });
  if (!res.ok) {
    await prisma.googleCalendarAccount
      .updateMany({ where: { tenantId, calendarKey: key }, data: { lastError: res.error } })
      .catch(() => {});
    return [];
  }

  const calendars = res.data.calendars as Record<string, { busy?: { start: string; end: string }[] }> | undefined;
  const busy = calendars?.[auth.calendarId]?.busy ?? [];
  const windows = busy
    .map((b) => ({ startMs: Date.parse(b.start), endMs: Date.parse(b.end) }))
    .filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs));

  // The key is derived from a tenant and a calendar, so it cannot be sprayed by a
  // visitor, but the map still gets a ceiling rather than growing for the process's life.
  if (freeBusyCache.size >= FREEBUSY_MAX_ENTRIES) freeBusyCache.clear();
  freeBusyCache.set(cacheKey, { at: now, windows });
  return windows;
}

/** Forget what Google said - after connecting, disconnecting, or pausing. */
export function resetFreeBusyCache(): void {
  freeBusyCache.clear();
}
