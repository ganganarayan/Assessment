import { getAudienceCanonical, getAudienceUsage } from "@/features/admin/actions/audience-list";
import { actingTenantId } from "@/lib/tenant/acting";
import { AudienceManager } from "@/features/admin/components/audience-manager";

export const dynamic = "force-dynamic";

/**
 * Audiences: the tenant's canonical "default list" (feeds the free-text audience
 * field's suggestions) plus the normalize tools for cleaning up typed values. Follows
 * the acting scope — platform/Gita in the global view, the entered tenant while
 * impersonating — the same as the Ads & payments settings.
 */
export default async function AudiencesPage() {
  const [canonical, usage, actingId] = await Promise.all([
    getAudienceCanonical(),
    getAudienceUsage(),
    actingTenantId(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Audiences {actingId ? "(this tenant)" : "(platform · Gita)"}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Maintain your default list of roles and clean up the values respondents typed in the
          free-text audience field.
        </p>
      </div>

      <AudienceManager
        initialCanonical={canonical.join("\n")}
        rows={usage.rows}
        canonical={usage.canonical}
      />
    </div>
  );
}
