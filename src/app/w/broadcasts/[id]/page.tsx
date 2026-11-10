import { notFound } from "next/navigation";
import { requireWorkspace, canEdit } from "@/lib/auth/guards";
import { ViewOnly } from "@/components/view-only";
import { requireReleasedFeature } from "@/lib/features/route-guard";
import { broadcastOptions, getBroadcast } from "@/features/broadcasts/data";
import { BroadcastEditor } from "@/features/broadcasts/components/broadcast-editor";

export const dynamic = "force-dynamic";

export default async function WorkspaceBroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  await requireReleasedFeature("broadcasts");
  const { tenantId, user: viewer } = await requireWorkspace();
  const readOnly = !canEdit(viewer);
  const { id } = await params;
  const [broadcast, options] = await Promise.all([getBroadcast(tenantId, id), broadcastOptions(tenantId)]);
  if (!broadcast) notFound();
  return (
    <ViewOnly readOnly={readOnly}>
      <BroadcastEditor broadcast={broadcast} options={options} basePath="/w/broadcasts" />
    </ViewOnly>
  );
}
