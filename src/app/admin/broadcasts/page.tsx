import { actingTenantId } from "@/lib/tenant/acting";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listBroadcasts, broadcastOptions } from "@/features/broadcasts/data";
import { BroadcastList } from "@/features/broadcasts/components/broadcast-list";

export const dynamic = "force-dynamic";

/** Broadcasts, platform view. Follows the acting scope like the other shared screens. */
export default async function AdminBroadcastsPage() {
  await requireSuperAdmin();
  const tenantId = await actingTenantId();
  const [rows, options] = await Promise.all([listBroadcasts(tenantId), broadcastOptions(tenantId)]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Broadcasts</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          One message to a filtered audience. The list is fixed when the send starts, anybody
          unsubscribed is excluded, and it goes out at a deliberately modest rate.
        </p>
      </div>
      <BroadcastList rows={rows} basePath="/admin/broadcasts" wabaAvailable={options.wabaAvailable} />
    </div>
  );
}
