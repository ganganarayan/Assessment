import { prisma } from "@/lib/db/prisma";
import { OperationsPanel } from "@/features/assessment/components/admin/operations-panel";
import { actingDataScope } from "@/lib/tenant/acting";
import { whereScope } from "@/lib/tenant/scope";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  // Scope the pickable assessments the same way every other /admin list does. This used
  // to read actingTenantId() directly, which means "tenantId IS NULL" when no workspace
  // is entered — that was the platform's funnel before the re-home and is nobody's rows
  // after it, so it would have drifted away from the rest of the console.
  const assessments = await prisma.assessment.findMany({
    where: whereScope(await actingDataScope()),
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
      <OperationsPanel assessments={assessments} showCrmTools />
    </div>
  );
}
