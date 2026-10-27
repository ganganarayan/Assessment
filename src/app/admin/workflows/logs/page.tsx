import Link from "next/link";
import { actingTenantId } from "@/lib/tenant/acting";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listJourneys } from "@/features/workflows/logs-data";
import { WorkflowLogs } from "@/features/workflows/components/workflow-logs";

export const dynamic = "force-dynamic";

/** Every contact journey through a sequence, for the acting workspace. */
export default async function AdminWorkflowLogsPage() {
  await requireSuperAdmin();
  const rows = await listJourneys(await actingTenantId());
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Workflow logs</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            One row per person who entered a sequence, newest first. Open one to see every step it
            took and what each one did.
          </p>
        </div>
        <Link href="/admin/workflows" className="rounded-md border px-3 py-2 text-sm hover:bg-[var(--muted)]">
          Workflows
        </Link>
      </div>
      <WorkflowLogs rows={rows} basePath="/admin/workflows" />
    </div>
  );
}
