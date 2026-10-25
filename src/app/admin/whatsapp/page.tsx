import { actingTenantId } from "@/lib/tenant/acting";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getWabaDashboard } from "@/features/whatsapp/dashboard-data";
import { WabaDashboard } from "@/features/whatsapp/components/waba-dashboard";

export const dynamic = "force-dynamic";

/** WhatsApp health, platform view. Follows the acting scope like the other shared screens. */
export default async function AdminWhatsAppPage() {
  await requireSuperAdmin();
  const tenantId = await actingTenantId();
  const view = await getWabaDashboard(tenantId);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp health</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          What Meta says about this number: whether it can send, its quality rating, how many
          people it can reach a day, and what the last 30 days cost. Read when you ask, not on
          every visit.
        </p>
      </div>
      <WabaDashboard view={view} />
    </div>
  );
}
