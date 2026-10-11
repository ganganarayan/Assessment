import { getAudienceLists, getAudienceUsage } from "@/features/admin/actions/audience-list";
import { actingTenantId } from "@/lib/tenant/acting";
import { AudienceManager } from "@/features/admin/components/audience-manager";

export const dynamic = "force-dynamic";

/**
 * Audiences: the named lists of roles an assessment can pick between, plus the
 * normalize tools for cleaning up typed values. Follows the acting scope - the
 * platform in the global view, the entered tenant while impersonating - the same as
 * the Ads & payments settings.
 */
export default async function AudiencesPage() {
  const [lists, usage, actingId] = await Promise.all([
    getAudienceLists(),
    getAudienceUsage(),
    actingTenantId(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Audiences {actingId ? "(this tenant)" : "(platform)"}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Keep as many named lists of roles as you need, edit any of them at any time, and clean up
          the values respondents typed in the free-text audience field. Each assessment picks the
          list it uses.
        </p>
      </div>

      <AudienceManager lists={lists} rows={usage.rows} canonical={usage.canonical} />
    </div>
  );
}
