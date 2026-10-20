"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { resolvePlan } from "@/lib/billing/plan-resolve";
import { rateLimit } from "@/lib/rate-limit";
import { getMetaRequestContext } from "@/lib/meta/request-context";
import { normalizeAttribution } from "@/lib/events/payload";
import { reportAppointment } from "@/lib/calendar/signals";
import { calendarOwnerKey, istDateKey, pickRoundRobin, slotLockFor } from "@/lib/calendar/slots";
import { bookingTypeBySlug, openSlotsByDate, slotSourceOf } from "@/features/calendar/data";
import { publicBookingSchema } from "@/features/calendar/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { type BookingConfirmation, type BookingLocationKindValue } from "@/features/calendar/types";

/**
 * The one action an anonymous visitor can call: book a slot.
 *
 * Everything a respondent sends is re-derived here. The posted instant is checked
 * against a freshly computed slot list rather than trusted, so a stale page, a
 * hand-crafted request or a slot that was taken thirty seconds ago all fail the same
 * way. The database has the last word: Appointment.slotLock is unique, so of two people
 * booking the same slot in the same second, exactly one wins.
 */

/**
 * Who is this, from the browser they opted in with?
 *
 * The booking link that goes in an email or a WhatsApp carries ?t=<result token> and the
 * page prefills from that server-side. A BARE link does not, and the person opening it
 * has usually just given their name, email and mobile two screens ago - so asking for
 * them again is asking somebody to prove they are themselves, to a page that could
 * already know.
 *
 * The handle is a360_xid: the first-party visitor id minted on their first visit, kept
 * in their own localStorage, and written onto Submission.metaExternalId at opt-in. So
 * this answers "which submission did THIS browser make in THIS workspace" and nothing
 * else.
 *
 * 🟡 The id is the authorisation, like a result token, and the same reasoning applies: a
 * random UUID in one browser's storage, scoped here to one workspace, returning only the
 * three fields the form asks for plus the person's own result token. Never a score,
 * never an answer, and never anything if the id does not match a submission. Guessing it
 * is guessing a UUID, and the rate limit below makes the attempt pointless as well as
 * hopeless.
 *
 * 🟡 A SHARED BROWSER shows the last person's details to the next one, because one
 * browser has one id. Accepted: the same is already true of the funnel itself (the id is
 * what dedupes a repeat visitor), the fields are editable, and the page says where they
 * came from rather than presenting them as fact. Anyone booking on a borrowed laptop
 * types over them, which is what they would have done with an empty form.
 */
export async function prefillForBooking(
  slug: string,
  visitorId: string,
): Promise<ActionResult<{ name: string; email: string; mobile: string; resultToken: string }>> {
  const vid = visitorId.trim();
  // A plausible id only: minted as a UUID, with the pre-crypto.randomUUID fallback
  // ("<ms>-<base36>") still in circulation on older browsers.
  if (vid.length < 16 || vid.length > 80) return { ok: false, error: "No match." };
  if (!rateLimit("bookprefill:global", 5000) || !rateLimit(`bookprefill:vid:${vid}`, 10)) {
    return { ok: false, error: "No match." };
  }

  const bookingType = await prisma.bookingType.findFirst({
    where: { slug, active: true },
    select: { tenantId: true },
  });
  if (!bookingType) return { ok: false, error: "No match." };

  const submission = await prisma.submission.findFirst({
    where: { tenantId: bookingType.tenantId, metaExternalId: vid },
    // Their latest run, because that is the one whose details are current.
    orderBy: { createdAt: "desc" },
    select: {
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
    },
  });
  // No lead on it means they started and never opted in: there is nothing to fill.
  if (!submission?.leadEmail) return { ok: false, error: "No match." };

  return {
    ok: true,
    data: {
      name: [submission.leadFirstName, submission.leadLastName].filter(Boolean).join(" "),
      email: submission.leadEmail,
      mobile: submission.leadMobile ?? "",
      // Handed back so the booking ATTACHES to that submission through the same
      // checked path a ?t= link uses. Without it the call would be a stranger's.
      resultToken: submission.resultToken ?? "",
    },
  };
}

export async function bookSlot(input: unknown): Promise<ActionResult<BookingConfirmation>> {
  const parsed = publicBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const v = parsed.data;

  const bookingType = await bookingTypeBySlug(v.slug);
  if (!bookingType || bookingType.tenant.status !== "ACTIVE") {
    return { ok: false, error: "This booking link is no longer available." };
  }

  // A parked workspace is read-only everywhere else (its funnel is paused), so it must
  // not keep taking bookings either. Said plainly, because the person reading it is a
  // respondent who cannot do anything about it.
  const plan = await resolvePlan(bookingType.tenantId);
  if (plan.parked) {
    return { ok: false, error: "Bookings are paused at the moment. Please try again later." };
  }

  const now = Date.now();
  const slotMap = await openSlotsByDate(slotSourceOf(bookingType), now);
  const dateKey = istDateKey(v.startMs);
  const slot = slotMap.get(dateKey)?.find((s) => s.startMs === v.startMs);
  if (!slot) {
    return { ok: false, error: "That time has just been taken. Pick another slot." };
  }

  /**
   * The submission this booking came out of, when the respondent arrived from their own
   * result page.
   *
   * Matched on the result token AND the owning tenant: the token is the respondent's
   * own capability, and without the tenant check a token from one workspace could
   * attach a lead to another workspace's appointment.
   */
  const submission = v.resultToken
    ? await prisma.submission.findFirst({
        where: { resultToken: v.resultToken, tenantId: bookingType.tenantId },
        select: { id: true, metaExternalId: true, attribution: true },
      })
    : null;

  // Match signals, captured NOW because this is the last moment there is a request to
  // read them from. The attendance that matters to the ad account is marked days later.
  const ctx = await getMetaRequestContext();

  const endMs = slot.endMs;
  try {
    /**
     * WHO GETS THIS CALL.
     *
     * A single-person link has one answer. A team link picks the member who has waited
     * longest among those actually free for this slot, and then has to survive the race
     * that makes a team page worth having: two people booking the same minute should get
     * two DIFFERENT members, not one winner and one apology.
     *
     * The lock is what arbitrates. It is keyed on the calendar, so two bookings at the
     * same instant on different members are different locks and both commit; two that
     * land on the SAME member collide, and the loser retries with the next in line. The
     * loop therefore ends either in a booking or in an honestly full slot, and never in
     * a double booking.
     */
    const rota: Record<string, number | null> = {};
    for (const m of bookingType.members ?? []) rota[m.userId] = m.lastAssignedAt?.getTime() ?? null;
    const isTeam = bookingType.assignmentMode === "ROUND_ROBIN" && (bookingType.members ?? []).length > 0;

    const tried: string[] = [];
    let created: { id: string; publicToken: string; startAt: Date } | null = null;
    let assignedUserId: string | null = null;

    // At most one attempt per member: a slot cannot be taken more times than there are
    // people to take it.
    const attempts = isTeam ? slot.freeOwners.length : 1;
    for (let i = 0; i < attempts && !created; i++) {
      const owner = isTeam ? pickRoundRobin(slot.freeOwners, rota, tried) : calendarOwnerKey(bookingType.assignedUserId);
      if (!owner) break;
      tried.push(owner);
      // "shared" is the key for the workspace calendar; the column holds null for it.
      assignedUserId = owner === "shared" ? null : owner;

      try {
        created = await prisma.appointment.create({
          data: {
            tenantId: bookingType.tenantId,
            bookingTypeId: bookingType.id,
            source: "BOOKING",
            status: "BOOKED",
            startAt: new Date(slot.startMs),
            endAt: new Date(endMs),
            attendeeName: v.name,
            attendeeEmail: v.email,
            attendeeMobile: v.mobile || null,
            notes: v.notes || null,
            submissionId: submission?.id ?? null,
            isPreview: v.preview,
            fbp: ctx.fbp,
            fbc: ctx.fbc,
            externalId: submission?.metaExternalId ?? null,
            clientIp: ctx.clientIpAddress,
            userAgent: ctx.clientUserAgent,
            attribution: (normalizeAttribution(submission?.attribution) ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
            // Whose diary this lands in, stamped rather than read through the link: the
            // link can be reassigned later, and this booking belongs to the calendar it
            // was actually made in.
            assignedUserId,
            slotLock: slotLockFor(bookingType.tenantId, assignedUserId, slot.startMs),
            publicToken: randomUUID(),
          },
          select: { id: true, publicToken: true, startAt: true },
        });
      } catch (e) {
        // That member was taken a moment ago. Try the next one rather than telling a
        // respondent the team is full when it is not.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }

    if (!created) {
      return { ok: false, error: "Somebody just took that slot. Pick another time." };
    }

    // Move the rota on, for the member who actually got it. Best-effort: a missed stamp
    // costs one turn of fairness, never a booking.
    if (isTeam && assignedUserId) {
      await prisma.bookingTypeMember
        .updateMany({
          where: { bookingTypeId: bookingType.id, userId: assignedUserId },
          data: { lastAssignedAt: new Date() },
        })
        .catch(() => {});
    }

    await reportAppointment(created.id, "BOOKED");

    return {
      ok: true,
      data: {
        appointmentId: created.id,
        startLabel: formatIST(created.startAt),
        durationMin: bookingType.durationMin,
        locationKind: bookingType.locationKind as BookingLocationKindValue,
        // Told only now that there is a booking to attach it to. On the slot picker the
        // meeting link would be a free consultation for anybody who opened the page.
        locationValue: bookingType.locationValue,
        // Relative, so the download is served by the host the respondent is already on.
        // An absolute URL built from an env var would send somebody who booked on a
        // tenant's own domain to the platform's, which is at best confusing and at
        // worst not routable for them.
        icsUrl: `/api/calendar/event/${created.publicToken}.ics`,
      },
    };
  } catch (e) {
    // The unique slotLock losing the race. Two people pressed the same slot; this is
    // the one that has to be told, and told something it can act on.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Somebody just took that slot. Pick another time." };
    }
    throw e;
  }
}
