import { notFound } from "next/navigation";
import { actingTenantId } from "@/lib/tenant/acting";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { builderOptions, getWorkflow } from "@/features/workflows/data";
import { WorkflowBuilder } from "@/features/workflows/components/workflow-builder";

export const dynamic = "force-dynamic";

export default async function AdminWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const tenantId = await actingTenantId();
  const [workflow, options] = await Promise.all([getWorkflow(tenantId, id), builderOptions(tenantId)]);
  if (!workflow) notFound();
  return <WorkflowBuilder workflow={workflow} options={options} basePath="/admin/workflows" />;
}
