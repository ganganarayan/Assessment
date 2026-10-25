import { requireWorkspace } from "@/lib/auth/guards";
import { requireReleasedFeature } from "@/lib/features/route-guard";
import { getWabaDashboard } from "@/features/whatsapp/dashboard-data";
import { WabaDashboard } from "@/features/whatsapp/components/waba-dashboard";

export const dynamic = "force-dynamic";

/**
 * WhatsApp health, workspace view.
 *
 * Guarded on the route as well as hidden in the nav: the figures here are read with
 * the workspace's own Meta token, so a stale link must not serve them to a workspace
 * the feature was never released to.
 */
export default async function WorkspaceWhatsAppPage() {
  await requireReleasedFeature("whatsapp");
  const { tenantId } = await requireWorkspace();
  const view = await getWabaDashboard(tenantId);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp health</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          What Meta says about your number: whether it can send, its quality rating, how many
          people you can reach a day, and what the last 30 days cost. Read when you ask, not on
          every visit.
        </p>
      </div>
      <WabaDashboard view={view} />
    </div>
  );
}
