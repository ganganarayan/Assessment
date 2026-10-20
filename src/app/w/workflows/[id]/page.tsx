import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/guards";
import { requireReleasedFeature } from "@/lib/features/route-guard";
import { builderOptions, getWorkflow } from "@/features/workflows/data";
import { WorkflowBuilder } from "@/features/workflows/components/workflow-builder";

export const dynamic = "force-dynamic";

export default async function WorkspaceWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  await requireReleasedFeature("workflows");
  const { tenantId } = await requireWorkspace();
  const { id } = await params;
  const [workflow, options] = await Promise.all([getWorkflow(tenantId, id), builderOptions(tenantId)]);
  if (!workflow) notFound();
  return <WorkflowBuilder workflow={workflow} options={options} basePath="/w/workflows" />;
}
