"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, configTenantOf } from "@/lib/tenant/acting";
import { appSettingWhere, tenantAppSettingId } from "@/lib/settings/tenant-row";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { reportAppointment } from "@/lib/calendar/signals";
import { slotLockFor, utcMsFor } from "@/lib/calendar/slots";
import {
  availabilityExceptionSchema,
  availabilityRuleSchema,
  bookingTypeSchema,
  manualAppointmentSchema,
} from "@/features/calendar/schemas";

/**
 * Owner-side calendar actions: the booking types, the weekly availability, the
 * appointments in the grid, and the subscription feed token.
 *
 * Every one of them resolves the ACTING scope and then checks the row it is about
 * against that tenant, so /admin and /w share the code and a workspace can only ever
 * touch its own diary. Mutations bail for view-only staff, like the rest of the app.
 *
 * 🟡 A "use server" module may export async functions ONLY. Types and constants live in
 * features/calendar/types.ts, and the schemas in features/calendar/schemas.ts: a type
 * exported from here typechecks locally and fails the Railway build.
 */

function refresh() {
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/calendar/availability");
  revalidatePath("/w/calendar");
  revalidatePath("/w/calendar/availability");
}

/** The acting tenant plus the view-only check, which every mutation here begins with. */
async function editor(): Promise<{ tenantId: string } | { error: string }> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return { error: denied.error };
  return { tenantId: configTenantOf(scope) };
}

/* ------------------------------------------------------------ booking types --- */

export async function saveBookingType(
  input: unknown,
  bookingTypeId?: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = bookingTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those details are not valid." };
  }
  const v = parsed.data;

  // A funnel or an ad account named here has to belong to this workspace. Checked
  // rather than trusted: both ids arrive from a form, and an ad account id from
  // another tenant would point this workspace's conversions at somebody else's pixel.
  if (v.assessmentId) {
    const owned = await prisma.assessment.findFirst({
      where: { id: v.assessmentId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "That assessment is not in this workspace." };
  }
  if (v.adAccountId) {
    const owned = await prisma.adAccount.findFirst({
      where: { id: v.adAccountId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "That ad account is not in this workspace." };
  }

  const data = {
    name: v.name,
    slug: v.slug,
    description: v.description || null,
    durationMin: v.durationMin,
    bufferMin: v.bufferMin,
    noticeMin: v.noticeMin,
    horizonDays: v.horizonDays,
    slotStepMin: v.slotStepMin,
    maxPerDay: v.maxPerDay,
    locationKind: v.locationKind,
    locationValue: v.locationValue || null,
    active: v.active,
    assessmentId: v.assessmentId || null,
    adAccountId: v.adAccountId || null,
    fireMetaCapi: v.fireMetaCapi,
    metaBookedEvent: v.metaBookedEvent,
    metaCancelledEvent: v.metaCancelledEvent,
    metaAttendedEvent: v.metaAttendedEvent,
    metaNoShowEvent: v.metaNoShowEvent,
  };

  try {
    if (bookingTypeId) {
      const existing = await prisma.bookingType.findFirst({
        where: { id: bookingTypeId, tenantId: auth.tenantId },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "That booking link is not in this workspace." };
      await prisma.bookingType.update({ where: { id: bookingTypeId }, data });
      refresh();
      return { ok: true, data: { id: bookingTypeId } };
    }
    const created = await prisma.bookingType.create({
      data: { ...data, tenantId: auth.tenantId },
      select: { id: true },
    });
    refresh();
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    // The slug is globally unique (the public page resolves by slug alone), so a
    // collision is with somebody else's link as well as with your own. Say what to do
    // about it rather than leaking that.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: `The link /b/${v.slug} is taken. Try another.` };
    }
    throw e;
  }
}

export async function deleteBookingType(bookingTypeId: string): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const t = await prisma.bookingType.findFirst({
    where: { id: bookingTypeId, tenantId: auth.tenantId },
    select: { id: true, _count: { select: { appointments: true } } },
  });
  if (!t) return { ok: false, error: "That booking link is not in this workspace." };

  // Deleting the link does NOT delete the calls sold through it (the relation is
  // SetNull), so the history survives. Upcoming bookings would quietly lose their
  // location and duration though, so those have to be dealt with first.
  const upcoming = await prisma.appointment.count({
    where: { bookingTypeId, status: "BOOKED", startAt: { gte: new Date() } },
  });
  if (upcoming > 0) {
    return {
      ok: false,
      error: `This link has ${upcoming} upcoming booking${upcoming === 1 ? "" : "s"}. Switch it off instead, or cancel those first.`,
    };
  }

  await prisma.bookingType.delete({ where: { id: bookingTypeId } });
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------- availability --- */

/** Confirm a booking type belongs to the acting workspace. */
async function ownedBookingType(tenantId: string, bookingTypeId: string): Promise<boolean> {
  const t = await prisma.bookingType.findFirst({
    where: { id: bookingTypeId, tenantId },
    select: { id: true },
  });
  return !!t;
}

export async function addAvailabilityRule(input: unknown): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = availabilityRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That window is not valid." };
  }
  const v = parsed.data;
  if (!(await ownedBookingType(auth.tenantId, v.bookingTypeId))) {
    return { ok: false, error: "That booking link is not in this workspace." };
  }
  await prisma.availabilityRule.create({
    data: { bookingTypeId: v.bookingTypeId, weekday: v.weekday, startMin: v.start, endMin: v.end },
  });
  refresh();
  return { ok: true };
}

export async function deleteAvailabilityRule(ruleId: string): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };
  const rule = await prisma.availabilityRule.findFirst({
    where: { id: ruleId, bookingType: { tenantId: auth.tenantId } },
    select: { id: true },
  });
  if (!rule) return { ok: false, error: "That window is not in this workspace." };
  await prisma.availabilityRule.delete({ where: { id: ruleId } });
  refresh();
  return { ok: true };
}

export async function addAvailabilityException(input: unknown): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = availabilityExceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That date is not valid." };
  }
  const v = parsed.data;
  if (!(await ownedBookingType(auth.tenantId, v.bookingTypeId))) {
    return { ok: false, error: "That booking link is not in this workspace." };
  }
  await prisma.availabilityException.create({
    data: {
      bookingTypeId: v.bookingTypeId,
      // Midnight UTC on the IST calendar date: the column is a DATE, so this is the
      // date itself rather than an instant that could shift a day on a UTC host.
      date: new Date(`${v.date}T00:00:00.000Z`),
      kind: v.kind,
      startMin: v.start,
      endMin: v.end,
      note: v.note || null,
    },
  });
  refresh();
  return { ok: true };
}

export async function deleteAvailabilityException(exceptionId: string): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };
  const ex = await prisma.availabilityException.findFirst({
    where: { id: exceptionId, bookingType: { tenantId: auth.tenantId } },
    select: { id: true },
  });
  if (!ex) return { ok: false, error: "That date is not in this workspace." };
  await prisma.availabilityException.delete({ where: { id: exceptionId } });
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------- appointments --- */

/** Start and end instants from the form's IST date and times. */
async function instantsFor(
  v: { date: string; start: number; end: number | null },
  bookingTypeId: string,
  tenantId: string,
): Promise<{ startAt: Date; endAt: Date; durationMin: number } | null> {
  let durationMin = 30;
  if (bookingTypeId) {
    const t = await prisma.bookingType.findFirst({
      where: { id: bookingTypeId, tenantId },
      select: { durationMin: true },
    });
    if (!t) return null;
    durationMin = t.durationMin;
  }
  const startAt = new Date(utcMsFor(v.date, v.start));
  const endAt = v.end != null ? new Date(utcMsFor(v.date, v.end)) : new Date(startAt.getTime() + durationMin * 60_000);
  return { startAt, endAt, durationMin: Math.round((endAt.getTime() - startAt.getTime()) / 60_000) };
}

/**
 * An appointment the owner types in: a call taken over the phone, or time blocked out.
 *
 * With a booking type it IS a booking - it locks the slot and reports to Meta like one,
 * which is the honest treatment of a call somebody asked for by phone. Without one it
 * is time off: it occupies the slot so nothing can be booked over it, and tells nobody.
 */
export async function createManualAppointment(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = manualAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those details are not valid." };
  }
  const v = parsed.data;
  const times = await instantsFor(v, v.bookingTypeId, auth.tenantId);
  if (!times) return { ok: false, error: "That booking link is not in this workspace." };

  const isBooking = !!v.bookingTypeId;
  try {
    const created = await prisma.appointment.create({
      data: {
        tenantId: auth.tenantId,
        bookingTypeId: v.bookingTypeId || null,
        source: isBooking ? "BOOKING" : "MANUAL",
        status: "BOOKED",
        startAt: times.startAt,
        endAt: times.endAt,
        title: v.title || null,
        notes: v.notes || null,
        attendeeName: v.attendeeName || null,
        attendeeEmail: v.attendeeEmail || null,
        attendeeMobile: v.attendeeMobile || null,
        // Blocked-out time has no slot lock: blocking the same hour twice is the
        // owner's business, and the lock exists to stop two PEOPLE taking one slot.
        slotLock: isBooking ? slotLockFor(auth.tenantId, times.startAt) : null,
        publicToken: randomUUID(),
      },
      select: { id: true },
    });
    refresh();
    if (isBooking) await reportAppointment(created.id, "BOOKED");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That slot is already booked." };
    }
    throw e;
  }
}

export async function updateAppointment(appointmentId: string, input: unknown): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = manualAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those details are not valid." };
  }
  const v = parsed.data;

  const existing = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: auth.tenantId },
    select: { id: true, startAt: true, status: true, source: true, bookingTypeId: true, slotLock: true },
  });
  if (!existing) return { ok: false, error: "That appointment is not in this workspace." };

  // The booking type is fixed once a row exists: changing it would change the duration,
  // the location and the pixel an already-reported booking belongs to.
  const bookingTypeId = existing.bookingTypeId ?? "";
  const times = await instantsFor(v, bookingTypeId, auth.tenantId);
  if (!times) return { ok: false, error: "That booking link is not in this workspace." };

  const moved = times.startAt.getTime() !== existing.startAt.getTime();
  const live = existing.status === "BOOKED";

  try {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        startAt: times.startAt,
        endAt: times.endAt,
        title: v.title || null,
        notes: v.notes || null,
        attendeeName: v.attendeeName || null,
        attendeeEmail: v.attendeeEmail || null,
        attendeeMobile: v.attendeeMobile || null,
        // The lock follows the new start, and only while the row is live. A cancelled
        // row keeps its null lock so its old slot stays free.
        ...(bookingTypeId && live ? { slotLock: slotLockFor(auth.tenantId, times.startAt) } : {}),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Another booking already holds that slot." };
    }
    throw e;
  }

  refresh();
  // A move is news for the CRM every time it happens, which is why this moment has no
  // once-guard: a call moved twice is two things the respondent has to be told.
  if (moved && live && existing.source === "BOOKING") {
    await reportAppointment(appointmentId, "RESCHEDULED");
  }
  return { ok: true };
}

export async function cancelAppointment(appointmentId: string): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const existing = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: auth.tenantId },
    select: { id: true, status: true, source: true },
  });
  if (!existing) return { ok: false, error: "That appointment is not in this workspace." };
  if (existing.status === "CANCELLED") return { ok: true };

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy: "operator",
      // 🔴 Releasing the lock is what frees the slot for the next person. Without this
      // line a cancelled 11:00 stays unbookable forever and nothing says why.
      slotLock: null,
    },
  });
  refresh();
  if (existing.source === "BOOKING") await reportAppointment(appointmentId, "CANCELLED");
  return { ok: true };
}

/**
 * Remove an appointment from the calendar entirely.
 *
 * 🟡 NOT the same as cancelling, and the dialog says so before it offers this. Cancel is
 * an outcome: it frees the slot, tells the CRM, reports a cancellation to Meta and
 * leaves the row where the owner can see what happened. Delete is for a row that should
 * never have existed - a test booking, a mis-typed block - and it tells nobody, because
 * there is nothing to tell.
 *
 * What it cannot undo is a conversion already sent: if this booking was reported to
 * Meta, deleting the row here does not unsend that, which is exactly why cancel is
 * offered first and this sits behind a confirmation.
 */
export async function deleteAppointment(appointmentId: string): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const existing = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "That appointment is not in this workspace." };

  await prisma.appointment.delete({ where: { id: appointmentId } });
  refresh();
  return { ok: true };
}

/**
 * Mark whether the person turned up. THE point of the calendar reporting to Meta at
 * all: a booking says somebody meant to come, and only this says whether they did.
 */
export async function markAttendance(
  appointmentId: string,
  outcome: "ATTENDED" | "NO_SHOW",
): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const existing = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: auth.tenantId },
    select: { id: true, status: true, source: true, startAt: true },
  });
  if (!existing) return { ok: false, error: "That appointment is not in this workspace." };
  if (existing.status === "CANCELLED") {
    return { ok: false, error: "This call was cancelled, so there is no outcome to record." };
  }
  // Nothing stops marking a call that has not happened yet beyond this: an owner
  // finishing a call five minutes early should be able to mark it, and a date in the
  // future is a mistake worth catching.
  if (existing.startAt.getTime() > Date.now() + 60_000) {
    return { ok: false, error: "This call has not started yet." };
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: outcome, attendanceMarkedAt: new Date() },
  });
  refresh();
  if (existing.source === "BOOKING") await reportAppointment(appointmentId, outcome);
  return { ok: true };
}

/* -------------------------------------------------------- subscription feed --- */

/**
 * Mint the workspace's read-only subscription token, or replace the one it has.
 *
 * Both jobs, one action, because they are the same write and the second is the only way
 * to revoke the first: a calendar client fetches that URL forever with no session to
 * end, so rotating the token is what takes a leaked subscription away. The page reads
 * the existing token itself - rendering a page must not mint a credential.
 */
export async function rotateCalendarFeed(): Promise<ActionResult<{ path: string }>> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };
  const token = randomBytes(24).toString("hex");
  await prisma.appSetting.upsert({
    where: appSettingWhere(auth.tenantId) as Prisma.AppSettingWhereUniqueInput,
    update: { calendarFeedToken: token },
    create: { id: tenantAppSettingId(auth.tenantId), tenantId: auth.tenantId, calendarFeedToken: token },
  });
  refresh();
  // A path, made absolute in the browser against the origin the owner is on. The feed
  // resolves by token on any host this app serves, so the host they are already using
  // is the one that certainly works for them.
  return { ok: true, data: { path: `/api/calendar/${token}.ics` } };
}
