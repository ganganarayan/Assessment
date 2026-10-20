import Link from "next/link";
import { automationPageProps } from "@/features/automation/page-data";
import { requireReleasedFeature } from "@/lib/features/route-guard";
import { AutomationManager } from "@/features/automation/components/automation-manager";

export const dynamic = "force-dynamic";

/**
 * Automations: when something happens to a call, send something. Confirmations,
 * reminders, follow-ups after a no-show.
 */
export default async function WorkspaceAutomationsPage() {
  // Held back until the owner releases it: a hidden link is presentation, not a permission.
  await requireReleasedFeature("automations");
  const props = await automationPageProps();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            A trigger and the messages it sends. Email goes out through your own sender; WhatsApp
            goes out as a template Meta has approved for your number.
          </p>
        </div>
        <Link href="/w/calendar" className="rounded-md border px-3 py-2 text-sm hover:bg-[var(--muted)]">
          Calendar
        </Link>
      </div>

      <AutomationManager {...props} />
    </div>
  );
}
