import { prisma } from "@/lib/db/prisma";
import { buildIcsCalendar, type IcsEvent } from "@/lib/calendar/ics";
import { STATUS_LABEL, type AppointmentStatusValue } from "@/features/calendar/types";

/**
 * The workspace's calendar subscription feed.
 *   GET /api/calendar/<token>.ics
 *
 * Read-only, and the whole reason it exists is that it needs nothing of the owner's: no
 * OAuth, no account connected, no credential held by this app. The URL is pasted into
 * Google Calendar, Apple Calendar or Outlook and the bookings appear there.
 *
 * 🟡 THE TOKEN IS THE AUTHORISATION, which is a deliberate trade and worth naming. A
 * calendar client fetches this URL forever with no session, so there is nothing else it
 * could present. The consequences are handled rather than ignored: the token is 24
 * random bytes, it is per workspace, it is rotatable from the Calendar page (which is
 * the only way to revoke a leaked subscription), the feed is never indexed, and it
 * carries times, names and the meeting link - never scores, answers or anything else
 * from the funnel behind the booking.
 *
 * A wrong token returns 404 rather than 401: there is no login to offer.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Six months back, twelve forward. A calendar client re-fetches on its own schedule,
 *  so an unbounded feed would grow forever and be re-downloaded in full each time. */
const PAST_DAYS = 183;
const FUTURE_DAYS = 365;
const MS_PER_DAY = 86_400_000;

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token ?? "";
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
  // Length-checked before the query: the parameter is request input, and a lookup is
  // not owed to anything that cannot even be a token.
  if (token.length < 32 || token.length > 128) {
    return new Response("Not found", { status: 404 });
  }

  const setting = await prisma.appSetting.findFirst({
    where: { calendarFeedToken: token },
    select: { tenantId: true, tenant: { select: { name: true, deletedAt: true } } },
  });
  if (!setting?.tenantId || setting.tenant?.deletedAt) {
    return new Response("Not found", { status: 404 });
  }

  const now = Date.now();
  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId: setting.tenantId,
      startAt: { gte: new Date(now - PAST_DAYS * MS_PER_DAY), lte: new Date(now + FUTURE_DAYS * MS_PER_DAY) },
    },
    orderBy: { startAt: "asc" },
    take: 2000,
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      title: true,
      notes: true,
      attendeeName: true,
      attendeeEmail: true,
      createdAt: true,
      updatedAt: true,
      bookingType: { select: { name: true, locationValue: true } },
    },
  });

  const events: IcsEvent[] = appointments.map((a) => {
    const who = a.attendeeName?.trim();
    const what = a.bookingType?.name ?? a.title ?? "Appointment";
    const status = a.status as AppointmentStatusValue;
    return {
      // Stable forever, and namespaced so it cannot collide with another app's event in
      // the same calendar. A changed UID would show a moved call as a second one.
      uid: `appointment-${a.id}@assess360`,
      startMs: a.startAt.getTime(),
      endMs: a.endAt.getTime(),
      summary: who ? `${what} with ${who}` : what,
      description: [a.notes?.trim(), status === "BOOKED" ? null : STATUS_LABEL[status]]
        .filter(Boolean)
        .join("\n") || null,
      location: a.bookingType?.locationValue ?? null,
      status: status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
      createdMs: a.createdAt.getTime(),
      updatedMs: a.updatedAt.getTime(),
      attendeeEmail: a.attendeeEmail,
      attendeeName: a.attendeeName,
    };
  });

  const body = buildIcsCalendar(`${setting.tenant?.name ?? "Assess360"} bookings`, events);
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      // Clients poll this; a short cache keeps a burst of them off the database without
      // making a new booking wait noticeably to appear.
      "cache-control": "private, max-age=60",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
