import { prisma } from "@/lib/db/prisma";
import { buildIcsCalendar, type IcsEvent } from "@/lib/calendar/ics";

/**
 * One appointment as a downloadable .ics, for the respondent's own confirmation screen
 * and, later, their reminder email.
 *   GET /api/calendar/event/<publicToken>.ics
 *
 * Authorised by Appointment.publicToken: a random per-row capability, so the link in
 * one person's confirmation can never open another person's booking. Deliberately NOT
 * the row id, which appears in operator URLs and would make every booking guessable
 * from any other.
 *
 * The respondent's own copy, so it carries their call and nothing else: no owner notes,
 * no score, no submission.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token ?? "";
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
  if (token.length < 20 || token.length > 128) return new Response("Not found", { status: 404 });

  const a = await prisma.appointment.findFirst({
    where: { publicToken: token },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      attendeeName: true,
      attendeeEmail: true,
      tenant: { select: { name: true, deletedAt: true } },
      bookingType: { select: { name: true, locationValue: true } },
    },
  });
  if (!a || a.tenant.deletedAt) return new Response("Not found", { status: 404 });

  const what = a.bookingType?.name ?? a.title ?? "Appointment";
  const event: IcsEvent = {
    uid: `appointment-${a.id}@assess360`,
    startMs: a.startAt.getTime(),
    endMs: a.endAt.getTime(),
    summary: `${what} with ${a.tenant.name}`,
    location: a.bookingType?.locationValue ?? null,
    status: a.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
    createdMs: a.createdAt.getTime(),
    updatedMs: a.updatedAt.getTime(),
    attendeeEmail: a.attendeeEmail,
    attendeeName: a.attendeeName,
  };

  return new Response(buildIcsCalendar(what, [event]), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="appointment.ics"',
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
