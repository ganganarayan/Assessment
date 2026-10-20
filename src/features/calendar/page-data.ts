import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, configTenantOf } from "@/lib/tenant/acting";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import type { Prisma } from "@prisma/client";
import {
  bookingPickers,
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
  canEdit: boolean;
  /** True when nothing can be booked yet, so the page can say where to start. */
  needsSetup: boolean;
}

export async function calendarPageProps(monthParam?: string): Promise<CalendarPageProps> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);
  const now = Date.now();
  const todayMonth = istMonthKey(now);
  // An unparseable ?m= is treated as "this month" rather than an error: the parameter
  // comes from a link somebody may have edited, and a 500 for a bad month is absurd.
  const monthKey = monthParam && isMonthKey(monthParam) ? monthParam : todayMonth;

  const [rows, awaitingOutcome, types] = await Promise.all([
    listMonthAppointments(tenantId, monthKey),
    listAwaitingOutcome(tenantId),
    prisma.bookingType.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, durationMin: true },
    }),
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
    canEdit: scope.canEdit,
    needsSetup: types.length === 0,
  };
}

export interface AvailabilityPageProps {
  bookingTypes: BookingTypeRow[];
  assessments: PickerOption[];
  adAccounts: PickerOption[];
  /** The feed's PATH, or null until one is generated. Made absolute in the browser,
   *  like every other link the owner copies out of this app. */
  feedPath: string | null;
  canEdit: boolean;
}

export async function availabilityPageProps(): Promise<AvailabilityPageProps> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);

  const [bookingTypes, pickers, setting] = await Promise.all([
    listBookingTypes(tenantId),
    bookingPickers(tenantId),
    prisma.appSetting.findUnique({
      where: appSettingWhere(tenantId) as Prisma.AppSettingWhereUniqueInput,
      select: { calendarFeedToken: true },
    }),
  ]);

  return {
    bookingTypes,
    assessments: pickers.assessments,
    adAccounts: pickers.adAccounts,
    // Read here rather than minted: generating a credential is a write, and a page
    // render must not perform one. The Generate button mints the first one.
    feedPath: setting?.calendarFeedToken ? `/api/calendar/${setting.calendarFeedToken}.ics` : null,
    canEdit: scope.canEdit,
  };
}
