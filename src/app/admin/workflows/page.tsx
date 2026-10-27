import { actingTenantId } from "@/lib/tenant/acting";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listWorkflows } from "@/features/workflows/data";
import { WorkflowList } from "@/features/workflows/components/workflow-list";

export const dynamic = "force-dynamic";

/** Workflows, platform view. Follows the acting scope like the other shared screens. */
export default async function AdminWorkflowsPage() {
  await requireSuperAdmin();
  const tenantId = await actingTenantId();
  // 🟡 Only in the PLATFORM scope. A super admin who has entered a tenant is looking at
  // that tenant, and the workspace-audience triggers are not theirs to build on.
  const rows = await listWorkflows(tenantId);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          A sequence of messages to one person over time. Waits, tags, and a stop the moment they
          unsubscribe.
        </p>
      </div>
      <WorkflowList rows={rows} basePath="/admin/workflows" isPlatform={isPlatformScope(tenantId)} />
    </div>
  );
}
