"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { rateLimit } from "@/lib/rate-limit";
import { reportAppointment } from "@/lib/calendar/signals";
import { istDateKey, istMinutesOfDay, minutesToHHMM, slotLockFor } from "@/lib/calendar/slots";
import { openSlotsByDate, slotSourceOf } from "@/features/calendar/data";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  type ManageBookingView,
  type PublicDay,
  type AppointmentStatusValue,
  type BookingLocationKindValue,
} from "@/features/calendar/types";

/**
 * "Change or cancel my booking", for the person who made it.
 *
 * 🔴 The reason this exists is the no-show. Somebody whose plans changed has exactly two
 * options when there is no link: turn up anyway, or disappear. Most disappear, and the
 * owner finds out by sitting on a call alone - which is also the outcome that teaches an
 * ad account the wrong thing. A cancel link converts a silent no-show into a freed slot
 * somebody else can take, and a reschedule link converts it into a kept appointment.
 *
 * Authorised by Appointment.publicToken: the random capability already minted for their
 * .ics download, so the link in their confirmation opens their booking and nobody
 * else's. No login, because the respondent does not have one and never will.
 *
 * A moved booking keeps its ROW - the same token, the same submission, the same match
 * signals - so their link keeps working, the call stays attached to the funnel that
 * produced it, and the reminders re-date themselves off the reschedule event.
 */

/** A plausible token before any query: the parameter is request input. */
function usableToken(token: string): string | null {
  const t = token.trim();
  return t.length >= 20 && t.length <= 128 ? t : null;
}

const APPOINTMENT_SELECT = {
  id: true,
  tenantId: true,
  status: true,
  startAt: true,
  endAt: true,
  publicToken: true,
  assignedUserId: true,
  submission: { select: { resultToken: true } },
  tenant: { select: { name: true, deletedAt: true } },
  bookingType: {
    select: {
      id: true,
      tenantId: true,
      assignedUserId: true,
      name: true,
      slug: true,
      active: true,
      durationMin: true,
      bufferMin: true,
      slotStepMin: true,
      noticeMin: true,
      horizonDays: true,
      maxPerDay: true,
      locationKind: true,
      locationValue: true,
      rules: true,
      exceptions: true,
    },
  },
} as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return `${DAYS_SHORT[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * Their booking, and what can still be done to it. Null when the token matches nothing,
 * which the page renders as a plain "this link is no longer valid" rather than an error.
 */
export async function loadManageView(token: string): Promise<ManageBookingView | null> {
  const clean = usableToken(token);
  if (!clean) return null;

  const a = await prisma.appointment.findFirst({
    where: { publicToken: clean },
    select: APPOINTMENT_SELECT,
  });
  if (!a || a.tenant.deletedAt) return null;

  const now = Date.now();
  const started = a.startAt.getTime() <= now;

  // Why they cannot change it, said once, in their words. Order matters: a cancelled
  // call that is also in the past should read as cancelled.
  const closedReason =
    a.status === "CANCELLED"
      ? "This booking was cancelled."
      : a.status === "ATTENDED" || a.status === "NO_SHOW"
        ? "This call has already taken place."
        : started
          ? "This call has already started."
          : null;
  const canChange = closedReason === null;

  // Slots are only worth computing while a move is possible AND the link still takes
  // bookings. A deleted or switched-off booking link leaves cancelling as the one
  // honest option rather than a picker that cannot commit.
  let days: PublicDay[] = [];
  if (canChange && a.bookingType?.active) {
    // Their call is with a PARTICULAR person. Moving it offers that person's free
    // times, not the team's: a respondent who booked Asha and reschedules should not
    // silently end up with somebody else.
    const slotMap = await openSlotsByDate(slotSourceOf(a.bookingType, a.assignedUserId), now);
    days = [...slotMap.entries()].map(([dateKey, slots]) => ({
      dateKey,
      label: dayLabel(dateKey),
      slots: slots
        // Their current slot is not a move. Offering it would let somebody "reschedule"
        // to the time they already have and wonder what happened.
        .filter((s) => s.startMs !== a.startAt.getTime())
        .map((s) => ({ startMs: s.startMs, timeLabel: minutesToHHMM(istMinutesOfDay(s.startMs)) })),
    }));
    days = days.filter((d) => d.slots.length > 0);
  }

  const resultToken = a.submission?.resultToken ?? "";
  return {
    token: clean,
    hostName: a.tenant.name,
    what: a.bookingType?.name ?? "Your appointment",
    startLabel: formatIST(a.startAt),
    durationMin: Math.max(1, Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60_000)),
    status: a.status as AppointmentStatusValue,
    locationKind: (a.bookingType?.locationKind as BookingLocationKindValue | undefined) ?? null,
    locationValue: a.status === "BOOKED" ? (a.bookingType?.locationValue ?? null) : null,
    canChange,
    closedReason,
    days,
    bookAgainPath: a.bookingType?.active
      ? `/b/${a.bookingType.slug}${resultToken ? `?t=${resultToken}` : ""}`
      : null,
  };
}

/**
 * Call it off.
 *
 * Frees the slot (slotLock goes null) and reports a cancellation, so the owner's
 * calendar, their CRM and their ad account all hear the same thing. `cancelledBy` says
 * it was the respondent, which is a different conversation from the owner cancelling.
 */
export async function cancelMyBooking(token: string): Promise<ActionResult> {
  const clean = usableToken(token);
  if (!clean) return { ok: false, error: "This link is no longer valid." };
  if (!rateLimit(`managebooking:${clean}`, 20)) {
    return { ok: false, error: "Too many attempts. Try again in a minute." };
  }

  const a = await prisma.appointment.findFirst({
    where: { publicToken: clean },
    select: { id: true, status: true, startAt: true, source: true, tenant: { select: { deletedAt: true } } },
  });
  if (!a || a.tenant.deletedAt) return { ok: false, error: "This link is no longer valid." };
  if (a.status === "CANCELLED") return { ok: true };
  if (a.status === "ATTENDED" || a.status === "NO_SHOW") {
    return { ok: false, error: "This call has already taken place." };
  }
  // Cancelling late is allowed right up to the start, deliberately: a late cancellation
  // is strictly better for everybody than the no-show it replaces.
  if (a.startAt.getTime() <= Date.now()) {
    return { ok: false, error: "This call has already started." };
  }

  await prisma.appointment.update({
    where: { id: a.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy: "respondent",
      slotLock: null,
    },
  });
  if (a.source === "BOOKING") await reportAppointment(a.id, "CANCELLED");
  return { ok: true };
}

/**
 * Move it to another time on the same booking link.
 *
 * The posted instant is re-derived against a freshly computed slot list rather than
 * trusted, exactly as a first booking is, and the unique slot lock settles a race with
 * somebody booking that slot at the same moment.
 */
export async function rescheduleMyBooking(token: string, startMs: number): Promise<ActionResult> {
  const clean = usableToken(token);
  if (!clean) return { ok: false, error: "This link is no longer valid." };
  if (!Number.isFinite(startMs) || startMs <= 0) return { ok: false, error: "Pick a time first." };
  if (!rateLimit(`managebooking:${clean}`, 20)) {
    return { ok: false, error: "Too many attempts. Try again in a minute." };
  }

  const a = await prisma.appointment.findFirst({
    where: { publicToken: clean },
    select: APPOINTMENT_SELECT,
  });
  if (!a || a.tenant.deletedAt) return { ok: false, error: "This link is no longer valid." };
  if (a.status !== "BOOKED") return { ok: false, error: "This booking can no longer be changed." };
  if (a.startAt.getTime() <= Date.now()) return { ok: false, error: "This call has already started." };
  if (!a.bookingType?.active) {
    return { ok: false, error: "This booking link is not taking new times. You can cancel instead." };
  }

  const now = Date.now();
  // Same person as before - see the comment in loadManageView.
  const slotMap = await openSlotsByDate(slotSourceOf(a.bookingType, a.assignedUserId), now);
  const slot = slotMap.get(istDateKey(startMs))?.find((s) => s.startMs === startMs);
  if (!slot) return { ok: false, error: "That time has just been taken. Pick another slot." };

  try {
    await prisma.appointment.update({
      where: { id: a.id },
      data: {
        startAt: new Date(slot.startMs),
        endAt: new Date(slot.endMs),
        // The lock moves with the booking, on the same calendar it was always in.
        slotLock: slotLockFor(a.tenantId, a.assignedUserId, slot.startMs),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Somebody just took that slot. Pick another time." };
    }
    throw e;
  }

  // Reports the move, which is also what re-dates every reminder queued against this
  // appointment: the automation hook re-reads the new start and moves its own rows.
  await reportAppointment(a.id, "RESCHEDULED");
  return { ok: true };
}
