import { requireWorkspace } from "@/lib/auth/guards";
import { requireReleasedFeature } from "@/lib/features/route-guard";
import { listBroadcasts, broadcastOptions } from "@/features/broadcasts/data";
import { BroadcastList } from "@/features/broadcasts/components/broadcast-list";

export const dynamic = "force-dynamic";

/**
 * Broadcasts, workspace view.
 *
 * Guarded on the ROUTE, not only hidden in the nav. Of everything held back, this is
 * the one where a stale link mattering would mean somebody reaching five thousand
 * people with a feature that was never released to them.
 */
export default async function WorkspaceBroadcastsPage() {
  await requireReleasedFeature("broadcasts");
  const { tenantId } = await requireWorkspace();
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
      <BroadcastList rows={rows} basePath="/w/broadcasts" wabaAvailable={options.wabaAvailable} />
    </div>
  );
}
