import Link from "next/link";
import { calendarPageProps } from "@/features/calendar/page-data";
import { CalendarBoard } from "@/features/calendar/components/calendar-board";

export const dynamic = "force-dynamic";

/**
 * The owner's calendar. Follows the acting scope, like every other shared screen: the
 * platform's own diary in the global view, and the tenant's while impersonating one.
 */
export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const props = await calendarPageProps(m);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Every 1:1 booking, in IST. Marking who showed up is what sends the real outcome back to
            the ad account.
          </p>
        </div>
        <Link
          href="/admin/calendar/availability"
          className="rounded-md border px-3 py-2 text-sm hover:bg-[var(--muted)]"
        >
          Availability
        </Link>
      </div>

      {props.needsSetup ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-[var(--muted-foreground)]">
          Nothing can be booked yet.{" "}
          <Link href="/admin/calendar/availability" className="underline">
            Create a booking link
          </Link>{" "}
          and give it some weekly hours.
        </p>
      ) : null}

      <CalendarBoard {...props} basePath="/admin/calendar" />
    </div>
  );
}
