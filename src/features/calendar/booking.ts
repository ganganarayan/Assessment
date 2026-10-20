"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { resolvePlan } from "@/lib/billing/plan-resolve";
import { getMetaRequestContext } from "@/lib/meta/request-context";
import { normalizeAttribution } from "@/lib/events/payload";
import { reportAppointment } from "@/lib/calendar/signals";
import { slotLockFor, istDateKey } from "@/lib/calendar/slots";
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
    const created = await prisma.appointment.create({
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
        slotLock: slotLockFor(bookingType.tenantId, slot.startMs),
        publicToken: randomUUID(),
      },
      select: { id: true, publicToken: true, startAt: true },
    });

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
