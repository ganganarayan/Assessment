import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, configTenantOf } from "@/lib/tenant/acting";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import type { Prisma } from "@prisma/client";
import {
  bookingPickers,
  calendarStaff,
  isMonthKey,
  istMonthKey,
  listAwaitingOutcome,
  listBookingTypes,
  listMonthAppointments,
  monthTitle,
  shiftMonth,
} from "@/features/calendar/data";
import { istDateKey } from "@/lib/calendar/slots";
import type { AppointmentRow, BookingTypeRow, PickerOption } from "@/features/calendar/types";

/**
 * Everything the two calendar screens need, assembled once so /admin and /w are thin
 * wrappers around the same work. Both resolve the ACTING scope: a tenant admin gets
 * their own workspace, a super admin gets the workspace they have entered, or the
 * platform's own when they have not.
 */

export interface CalendarPageProps {
  monthKey: string;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  todayMonth: string;
  todayKey: string;
  rows: AppointmentRow[];
  awaitingOutcome: AppointmentRow[];
  bookingTypes: (PickerOption & { durationMin: number })[];
  /** Everybody whose calendar this workspace runs, for the filter and the block form. */
  staff: PickerOption[];
  /** The filter in force: "all", "shared", or a staff id. */
  who: string;
  canEdit: boolean;
  /** True when nothing can be booked yet, so the page can say where to start. */
  needsSetup: boolean;
}

export async function calendarPageProps(
  monthParam?: string,
  /** ?who= from the URL: a staff id, "shared" for the workspace calendar, or absent for
   *  everybody, which is the owner default. */
  whoParam?: string,
): Promise<CalendarPageProps> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);
  const now = Date.now();
  const todayMonth = istMonthKey(now);
  // An unparseable ?m= is treated as "this month" rather than an error: the parameter
  // comes from a link somebody may have edited, and a 500 for a bad month is absurd.
  const monthKey = monthParam && isMonthKey(monthParam) ? monthParam : todayMonth;

  /**
   * Which calendar is being looked at.
   *
   * undefined means every calendar in the workspace, which is the owner's default view
   * and the only one that makes sense when they have four staff members. "shared" is the
   * workspace's own calendar, which is a real diary rather than "no filter" - that
   * distinction is the same one the slot maths makes, so the screen and the booking
   * agree about what an unassigned link means.
   */
  const who =
    whoParam === undefined || whoParam === "" || whoParam === "all"
      ? undefined
      : whoParam === "shared"
        ? null
        : whoParam;

  const [rows, awaitingOutcome, types, staff] = await Promise.all([
    listMonthAppointments(tenantId, monthKey, who),
    listAwaitingOutcome(tenantId, 20, who),
    prisma.bookingType.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, durationMin: true },
    }),
    calendarStaff(tenantId),
  ]);

  return {
    monthKey,
    monthLabel: monthTitle(monthKey),
    prevMonth: shiftMonth(monthKey, -1),
    nextMonth: shiftMonth(monthKey, 1),
    todayMonth,
    todayKey: istDateKey(now),
    rows,
    awaitingOutcome,
    bookingTypes: types.map((t) => ({ id: t.id, label: t.name, durationMin: t.durationMin })),
    staff,
    who: whoParam && whoParam !== "" ? whoParam : "all",
    canEdit: scope.canEdit,
    needsSetup: types.length === 0,
  };
}

export interface AvailabilityPageProps {
  bookingTypes: BookingTypeRow[];
  assessments: PickerOption[];
  adAccounts: PickerOption[];
  /** Who a booking link can be assigned to. */
  staff: PickerOption[];
  /** The feed's PATH, or null until one is generated. Made absolute in the browser,
   *  like every other link the owner copies out of this app. */
  feedPath: string | null;
  canEdit: boolean;
}

export async function availabilityPageProps(): Promise<AvailabilityPageProps> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);

  const [bookingTypes, pickers, setting, staff] = await Promise.all([
    listBookingTypes(tenantId),
    bookingPickers(tenantId),
    prisma.appSetting.findUnique({
      where: appSettingWhere(tenantId) as Prisma.AppSettingWhereUniqueInput,
      select: { calendarFeedToken: true },
    }),
    calendarStaff(tenantId),
  ]);

  return {
    bookingTypes,
    assessments: pickers.assessments,
    adAccounts: pickers.adAccounts,
    staff,
    // Read here rather than minted: generating a credential is a write, and a page
    // render must not perform one. The Generate button mints the first one.
    feedPath: setting?.calendarFeedToken ? `/api/calendar/${setting.calendarFeedToken}.ics` : null,
    canEdit: scope.canEdit,
  };
}
