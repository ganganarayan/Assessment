import Link from "next/link";
import { automationPageProps } from "@/features/automation/page-data";
import { AutomationManager } from "@/features/automation/components/automation-manager";

export const dynamic = "force-dynamic";

/** Automations for the acting workspace: the platform's own, or the entered tenant's. */
export default async function AdminAutomationsPage() {
  const props = await automationPageProps();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            A trigger and the messages it sends, for appointments. Nurture still owns the one-shot
            send on opt-in.
          </p>
        </div>
        <Link href="/admin/calendar" className="rounded-md border px-3 py-2 text-sm hover:bg-[var(--muted)]">
          Calendar
        </Link>
      </div>

      <AutomationManager {...props} />
    </div>
  );
}
