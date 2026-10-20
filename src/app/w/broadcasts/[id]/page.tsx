import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/guards";
import { requireReleasedFeature } from "@/lib/features/route-guard";
import { broadcastOptions, getBroadcast } from "@/features/broadcasts/data";
import { BroadcastEditor } from "@/features/broadcasts/components/broadcast-editor";

export const dynamic = "force-dynamic";

export default async function WorkspaceBroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  await requireReleasedFeature("broadcasts");
  const { tenantId } = await requireWorkspace();
  const { id } = await params;
  const [broadcast, options] = await Promise.all([getBroadcast(tenantId, id), broadcastOptions(tenantId)]);
  if (!broadcast) notFound();
  return <BroadcastEditor broadcast={broadcast} options={options} basePath="/w/broadcasts" />;
}
