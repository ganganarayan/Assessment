import Link from "next/link";
import { getEventRegistry } from "@/features/events/data";
import { EventRegistryManager } from "@/features/events/components/event-registry-manager";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const { active, deactivated, purged } = await getEventRegistry();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Event Registry</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Event names are immutable. Manage lifecycle here; webhook routing is
            on the Webhooks page.
          </p>
        </div>
        <Link href="/admin/events/log" className={buttonVariants({ variant: "outline", size: "sm" })}>
          View event log
        </Link>
      </div>

      <EventRegistryManager active={active} deactivated={deactivated} purged={purged} />
    </div>
  );
}
