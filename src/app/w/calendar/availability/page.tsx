import Link from "next/link";
import { availabilityPageProps } from "@/features/calendar/page-data";
import { AvailabilityManager } from "@/features/calendar/components/availability-manager";

export const dynamic = "force-dynamic";

/**
 * What this workspace offers for 1:1 booking, and when. Booking links, weekly hours,
 * dates off, and the read-only feed that puts the bookings in the owner's own calendar.
 */
export default async function WorkspaceAvailabilityPage() {
  const props = await availabilityPageProps();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Availability</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Create a booking link, set the hours you are free, and share the address. All times are IST.
          </p>
        </div>
        <Link href="/w/calendar" className="rounded-md border px-3 py-2 text-sm hover:bg-[var(--muted)]">
          Back to calendar
        </Link>
      </div>

      <AvailabilityManager {...props} />
    </div>
  );
}
