import Link from "next/link";
import { calendarPageProps } from "@/features/calendar/page-data";
import { CalendarBoard } from "@/features/calendar/components/calendar-board";

export const dynamic = "force-dynamic";

/**
 * The workspace calendar: this month's bookings, the day in detail, and the calls
 * waiting on an outcome. One shared calendar per workspace; what can be booked and when
 * lives on the Availability page beside it.
 */
export default async function WorkspaceCalendarPage({
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
            Every 1:1 booking, in IST. Mark who showed up and who did not, and your ad account learns
            which clicks turn into conversations.
          </p>
        </div>
        <Link
          href="/w/calendar/availability"
          className="rounded-md border px-3 py-2 text-sm hover:bg-[var(--muted)]"
        >
          Availability
        </Link>
      </div>

      {props.needsSetup ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-[var(--muted-foreground)]">
          Nothing can be booked yet.{" "}
          <Link href="/w/calendar/availability" className="underline">
            Create a booking link
          </Link>{" "}
          and give it some weekly hours.
        </p>
      ) : null}

      <CalendarBoard {...props} basePath="/w/calendar" />
    </div>
  );
}
