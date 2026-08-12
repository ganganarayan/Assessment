import { prisma } from "@/lib/db/prisma";
import { OperationsPanel } from "@/features/assessment/components/admin/operations-panel";
import { actingTenantId } from "@/lib/tenant/acting";
import { requireWorkspace } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/** Tenant workspace Operations — same panel as /admin/operations, scoped to this
 *  workspace's tenant (actingTenantId resolves a tenant admin to their own tenant). */
export default async function WorkspaceOperationsPage() {
  await requireWorkspace();
  const assessments = await prisma.assessment.findMany({
    where: { tenantId: await actingTenantId() },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Data maintenance + CRM senders for existing contacts. Pick an assessment, then run a tool.
        </p>
      </div>
      <OperationsPanel assessments={assessments} />
    </div>
  );
}
