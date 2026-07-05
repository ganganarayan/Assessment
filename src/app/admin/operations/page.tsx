import { prisma } from "@/lib/db/prisma";
import { OperationsPanel } from "@/features/assessment/components/admin/operations-panel";
import { actingTenantId } from "@/lib/tenant/acting";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  // Scope the pickable assessments to the entered tenant (null = platform/Gita).
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
