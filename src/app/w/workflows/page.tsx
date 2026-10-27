import { requireWorkspace } from "@/lib/auth/guards";
import { requireReleasedFeature } from "@/lib/features/route-guard";
import { listWorkflows } from "@/features/workflows/data";
import { WorkflowList } from "@/features/workflows/components/workflow-list";

export const dynamic = "force-dynamic";

/**
 * Workflows, workspace view.
 *
 * Guarded on the ROUTE and not only hidden in the nav: a hidden link is presentation,
 * never a permission, and workflows are held back from customers until the screens are
 * finished and the queue has something driving it.
 */
export default async function WorkspaceWorkflowsPage() {
  await requireReleasedFeature("workflows");
  const { tenantId } = await requireWorkspace();
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
      <WorkflowList rows={rows} basePath="/w/workflows" isPlatform={false} />
    </div>
  );
}
