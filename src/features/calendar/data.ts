import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { formatIST } from "@/lib/date";
import { tenantCanonicalOrigin } from "@/lib/seo/site";
import {
  daySlots,
  horizonDateKeys,
  istDateKey,
  istMinutesOfDay,
  minutesToHHMM,
  utcMsFor,
  type BusyInput,
  type SlotExceptionInput,
  type SlotRuleInput,
} from "@/lib/calendar/slots";
import {
  type AppointmentRow,
  type BookingTypeRow,
  type PickerOption,
  type PublicBookingView,
  type PublicDay,
  type BookingLocationKindValue,
  type AppointmentStatusValue,
  type AppointmentSourceValue,
} from "@/features/calendar/types";

/**
 * Reads for the calendar: the owner's month view, the availability screen, and the
 * public slot picker.
 *
 * Scoped by a CONCRETE tenant id throughout, never a pooled scope. A calendar is one
 * workspace's diary: two tenants' appointments in one grid would be a list of times
 * with no indication of whose they are, and the cross-tenant view that exists for
 * submissions has no equivalent meaning here.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "Mon 20 Oct" for an IST date key. Built here rather than with toLocaleDateString,
 *  which would render in the runtime's locale (US order on Railway). */
function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return `${DAYS_SHORT[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
}

/** "YYYY-MM" for an IST month, which is how the month view is addressed in the URL. */
export function istMonthKey(ms: number): string {
  return istDateKey(ms).slice(0, 7);
}

/** True for a well-formed "YYYY-MM". */
export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** The month before or after one, staying in "YYYY-MM". */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const zero = (y as number) * 12 + ((m as number) - 1) + delta;
  return `${String(Math.floor(zero / 12)).padStart(4, "0")}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

/** "October 2026", for the month heading. */
export function monthTitle(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[Number(m) - 1]} ${y}`;
}

function toRow(a: {
  id: string;
  startAt: Date;
  endAt: Date;
  status: string;
  source: string;
  title: string | null;
  notes: string | null;
  attendeeName: string | null;
  attendeeEmail: string | null;
  attendeeMobile: string | null;
  submissionId: string | null;
  isPreview: boolean;
  reportedBookedAt: Date | null;
  reportedAttendedAt: Date | null;
  reportedNoShowAt: Date | null;
  bookingType: { id: string; name: string; locationKind: string; locationValue: string | null } | null;
}): AppointmentRow {
  return {
    id: a.id,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    startLabel: formatIST(a.startAt),
    dateKey: istDateKey(a.startAt.getTime()),
    timeLabel: minutesToHHMM(istMinutesOfDay(a.startAt.getTime())),
    status: a.status as AppointmentStatusValue,
    source: a.source as AppointmentSourceValue,
    title: a.title,
    notes: a.notes,
    attendeeName: a.attendeeName,
    attendeeEmail: a.attendeeEmail,
    attendeeMobile: a.attendeeMobile,
    bookingTypeId: a.bookingType?.id ?? null,
    bookingTypeName: a.bookingType?.name ?? null,
    locationKind: (a.bookingType?.locationKind as BookingLocationKindValue | undefined) ?? null,
    locationValue: a.bookingType?.locationValue ?? null,
    submissionId: a.submissionId,
    isPreview: a.isPreview,
    metaBooked: a.reportedBookedAt != null,
    metaOutcome: a.reportedAttendedAt != null || a.reportedNoShowAt != null,
  };
}

const ROW_SELECT = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  source: true,
  title: true,
  notes: true,
  attendeeName: true,
  attendeeEmail: true,
  attendeeMobile: true,
  submissionId: true,
  isPreview: true,
  reportedBookedAt: true,
  reportedAttendedAt: true,
  reportedNoShowAt: true,
  bookingType: { select: { id: true, name: true, locationKind: true, locationValue: true } },
} as const;

/**
 * Every appointment in one IST month, cancellations included.
 *
 * Cancellations stay in the grid, greyed, rather than vanishing: an owner who cannot
 * see that the 11:00 call was called off has no way to tell it apart from a slot that
 * was never booked, and that is the difference between a quiet week and a problem.
 */
export async function listMonthAppointments(tenantId: string, monthKey: string): Promise<AppointmentRow[]> {
  if (!isMonthKey(monthKey)) return [];
  // Bounded by the first instant of this IST month and of the next one, so a booking at
  // 23:30 IST on the last day of the month lands in the month its owner calls it.
  const gte = new Date(utcMsFor(`${monthKey}-01`, 0));
  const lt = new Date(utcMsFor(`${shiftMonth(monthKey, 1)}-01`, 0));
  const rows = await prisma.appointment.findMany({
    where: { tenantId, startAt: { gte, lt } },
    orderBy: { startAt: "asc" },
    select: ROW_SELECT,
    take: 1000,
  });
  return rows.map(toRow);
}

/** The next appointments from now, for the panel beside the grid. */
export async function listUpcomingAppointments(tenantId: string, take = 10): Promise<AppointmentRow[]> {
  const rows = await prisma.appointment.findMany({
    where: { tenantId, status: "BOOKED", startAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    take,
    select: ROW_SELECT,
  });
  return rows.map(toRow);
}

/**
 * Calls that have HAPPENED and whose outcome nobody has marked yet.
 *
 * The one list that makes the Meta side work. Attendance is reported from here, and an
 * owner who is never shown "you have four calls to mark" marks none of them, which
 * leaves the ad account with bookings and no outcomes.
 */
export async function listAwaitingOutcome(tenantId: string, take = 20): Promise<AppointmentRow[]> {
  const rows = await prisma.appointment.findMany({
    where: { tenantId, status: "BOOKED", source: "BOOKING", endAt: { lt: new Date() } },
    orderBy: { startAt: "desc" },
    take,
    select: ROW_SELECT,
  });
  return rows.map(toRow);
}

/** The workspace's origin, for showing a tenant their own booking link. */
async function originFor(tenantId: string): Promise<string> {
  const origin = await tenantCanonicalOrigin(tenantId).catch(() => null);
  return origin ?? env.NEXT_PUBLIC_APP_URL;
}

export async function listBookingTypes(tenantId: string): Promise<BookingTypeRow[]> {
  const [types, origin] = await Promise.all([
    prisma.bookingType.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      include: {
        rules: { orderBy: [{ weekday: "asc" }, { startMin: "asc" }] },
        exceptions: { orderBy: { date: "asc" } },
        assessment: { select: { title: true } },
        _count: { select: { appointments: true } },
      },
    }),
    originFor(tenantId),
  ]);

  const upcoming = await prisma.appointment.groupBy({
    by: ["bookingTypeId"],
    where: { tenantId, status: "BOOKED", startAt: { gte: new Date() } },
    _count: { _all: true },
  });
  const upcomingByType = new Map(upcoming.map((u) => [u.bookingTypeId, u._count._all]));

  return types.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    durationMin: t.durationMin,
    bufferMin: t.bufferMin,
    noticeMin: t.noticeMin,
    horizonDays: t.horizonDays,
    slotStepMin: t.slotStepMin,
    maxPerDay: t.maxPerDay,
    locationKind: t.locationKind as BookingLocationKindValue,
    locationValue: t.locationValue,
    active: t.active,
    assessmentId: t.assessmentId,
    assessmentTitle: t.assessment?.title ?? null,
    adAccountId: t.adAccountId,
    fireMetaCapi: t.fireMetaCapi,
    metaBookedEvent: t.metaBookedEvent,
    metaCancelledEvent: t.metaCancelledEvent,
    metaAttendedEvent: t.metaAttendedEvent,
    metaNoShowEvent: t.metaNoShowEvent,
    publicUrl: `${origin}/b/${t.slug}`,
    rules: t.rules.map((r) => ({ id: r.id, weekday: r.weekday, startMin: r.startMin, endMin: r.endMin })),
    exceptions: t.exceptions.map((e) => ({
      id: e.id,
      dateKey: e.date.toISOString().slice(0, 10),
      kind: e.kind as "BLOCK" | "OPEN",
      startMin: e.startMin,
      endMin: e.endMin,
      note: e.note,
    })),
    upcomingCount: upcomingByType.get(t.id) ?? 0,
  }));
}

/** What a booking type can be attached to: this workspace's funnels and ad accounts. */
export async function bookingPickers(
  tenantId: string,
): Promise<{ assessments: PickerOption[]; adAccounts: PickerOption[] }> {
  const [assessments, adAccounts] = await Promise.all([
    prisma.assessment.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
      take: 200,
    }),
    prisma.adAccount.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { label: "asc" }],
      select: { id: true, label: true, isDefault: true },
    }),
  ]);
  return {
    assessments: assessments.map((a) => ({ id: a.id, label: a.title })),
    adAccounts: adAccounts.map((a) => ({ id: a.id, label: a.isDefault ? `${a.label} (default)` : a.label })),
  };
}

/* ------------------------------------------------------------ availability --- */

/**
 * Time already taken across the WHOLE workspace in a window.
 *
 * Deliberately not filtered to one booking type: there is one calendar, so a strategy
 * call and a discovery call cannot be sold the same 11:00. Cancelled rows are excluded,
 * which is what frees a slot when somebody drops out.
 */
export async function busyIntervals(
  tenantId: string,
  fromMs: number,
  toMs: number,
): Promise<(BusyInput & { isBooking: boolean })[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      tenantId,
      status: { not: "CANCELLED" },
      startAt: { lt: new Date(toMs) },
      endAt: { gt: new Date(fromMs) },
    },
    select: { startAt: true, endAt: true, source: true },
    take: 2000,
  });
  return rows.map((r) => ({
    startMs: r.startAt.getTime(),
    endMs: r.endAt.getTime(),
    // Blocked-out time takes the slot but is not a booking, so it must not count
    // against a "most per day" cap: an owner who blocks out lunch has not used up one
    // of the three calls they are willing to take.
    isBooking: r.source === "BOOKING",
  }));
}

interface SlotSource {
  id: string;
  tenantId: string;
  durationMin: number;
  bufferMin: number;
  slotStepMin: number;
  noticeMin: number;
  horizonDays: number;
  maxPerDay: number | null;
  rules: SlotRuleInput[];
  exceptions: SlotExceptionInput[];
}

/**
 * The open slots per date for a booking type, which is the ONE answer both the public
 * page and the booking action use.
 *
 * Shared on purpose: the page offers slots and the action re-derives them to check what
 * was posted. Two implementations of "is this slot open" would eventually disagree, and
 * the disagreement would be a booking the owner never offered.
 */
export async function openSlotsByDate(
  source: SlotSource,
  nowMs: number,
): Promise<Map<string, { startMs: number; endMs: number }[]>> {
  const dateKeys = horizonDateKeys(nowMs, source.horizonDays);
  const firstKey = dateKeys[0] as string;
  const lastKey = dateKeys[dateKeys.length - 1] as string;
  const busy = await busyIntervals(source.tenantId, utcMsFor(firstKey, 0), utcMsFor(lastKey, 1440));

  // Live bookings per IST date, for the per-day cap. Counted from the same busy rows
  // rather than a second query: the cap is about this workspace's day, which is what
  // these rows are. Blocked-out time is excluded - it is not a call anybody booked.
  const perDay = new Map<string, number>();
  for (const b of busy) {
    if (!b.isBooking) continue;
    const key = istDateKey(b.startMs);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const out = new Map<string, { startMs: number; endMs: number }[]>();
  for (const dateKey of dateKeys) {
    const slots = daySlots({
      dateKey,
      rules: source.rules,
      exceptions: source.exceptions,
      busy,
      durationMin: source.durationMin,
      bufferMin: source.bufferMin,
      slotStepMin: source.slotStepMin,
      noticeMin: source.noticeMin,
      nowMs,
      horizonDays: source.horizonDays,
      maxPerDay: source.maxPerDay,
      bookedCountOnDay: perDay.get(dateKey) ?? 0,
    });
    if (slots.length) out.set(dateKey, slots);
  }
  return out;
}

/** Load a booking type by its public slug, with everything the slot math needs. */
export async function bookingTypeBySlug(slug: string) {
  return prisma.bookingType.findFirst({
    where: { slug, active: true, tenant: { deletedAt: null } },
    include: {
      rules: true,
      exceptions: true,
      tenant: { select: { id: true, name: true, status: true } },
    },
  });
}

function slotSourceOf(t: {
  id: string;
  tenantId: string;
  durationMin: number;
  bufferMin: number;
  slotStepMin: number;
  noticeMin: number;
  horizonDays: number;
  maxPerDay: number | null;
  rules: { weekday: number; startMin: number; endMin: number }[];
  exceptions: { date: Date; kind: string; startMin: number | null; endMin: number | null }[];
}): SlotSource {
  return {
    id: t.id,
    tenantId: t.tenantId,
    durationMin: t.durationMin,
    bufferMin: t.bufferMin,
    slotStepMin: t.slotStepMin,
    noticeMin: t.noticeMin,
    horizonDays: t.horizonDays,
    maxPerDay: t.maxPerDay,
    rules: t.rules.map((r) => ({ weekday: r.weekday, startMin: r.startMin, endMin: r.endMin })),
    exceptions: t.exceptions.map((e) => ({
      dateKey: e.date.toISOString().slice(0, 10),
      kind: e.kind as "BLOCK" | "OPEN",
      startMin: e.startMin,
      endMin: e.endMin,
    })),
  };
}

export { slotSourceOf };

/** Everything the public page at /b/[slug] renders. Null when there is no such link. */
export async function publicBookingView(slug: string, nowMs = Date.now()): Promise<PublicBookingView | null> {
  const t = await bookingTypeBySlug(slug);
  if (!t || t.tenant.status !== "ACTIVE") return null;

  const slotMap = await openSlotsByDate(slotSourceOf(t), nowMs);
  const days: PublicDay[] = [...slotMap.entries()].map(([dateKey, slots]) => ({
    dateKey,
    label: dayLabel(dateKey),
    slots: slots.map((s) => ({
      startMs: s.startMs,
      timeLabel: minutesToHHMM(istMinutesOfDay(s.startMs)),
    })),
  }));

  return {
    slug: t.slug,
    name: t.name,
    description: t.description,
    durationMin: t.durationMin,
    locationKind: t.locationKind as BookingLocationKindValue,
    // The address or the number is only told to somebody who has booked. On the picker
    // it would be a free consultation line on a public page.
    locationValue: null,
    days,
    hostName: t.tenant.name,
  };
}
