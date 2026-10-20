import { notFound } from "next/navigation";
import { actingTenantId } from "@/lib/tenant/acting";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { broadcastOptions, getBroadcast } from "@/features/broadcasts/data";
import { BroadcastEditor } from "@/features/broadcasts/components/broadcast-editor";

export const dynamic = "force-dynamic";

export default async function AdminBroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const tenantId = await actingTenantId();
  const [broadcast, options] = await Promise.all([getBroadcast(tenantId, id), broadcastOptions(tenantId)]);
  if (!broadcast) notFound();
  return <BroadcastEditor broadcast={broadcast} options={options} basePath="/admin/broadcasts" />;
}
