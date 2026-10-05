import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";

/**
 * May this tenant take money from respondents at all?
 *
 * Three switches, most specific last:
 *   1. AppSetting(singleton).paymentsEnabledGlobal - the platform master.
 *   2. Tenant.paymentsEnabled                      - per tenant, set by the owner.
 *   3. Assessment.paidMode                         - per assessment, set by the tenant.
 *
 * This resolves 1 AND 2. The third is read where it already is. A funnel whose tenant
 * is switched off simply runs FREE: paid mode is forced off when the public assessment
 * is resolved, so the respondent reaches their result rather than meeting a payment
 * step that then refuses. Failing at the moment someone tries to pay is the worst
 * possible place to express this decision.
 *
 * The platform's own scope is never gated by the tenant switch - the owner's funnels
 * are not a customer of this.
 */
export async function paymentsAllowed(tenantId: string | null): Promise<boolean> {
  try {
    const [master, tenant] = await Promise.all([
      prisma.appSetting.findUnique({
        where: { id: "singleton" },
        select: { paymentsEnabledGlobal: true },
      }),
      isPlatformScope(tenantId)
        ? Promise.resolve(null)
        : prisma.tenant.findUnique({
            where: { id: tenantId as string },
            select: { paymentsEnabled: true },
          }),
    ]);
    // An absent singleton means the platform was never configured, which is not a
    // reason to stop every funnel in the system taking money: default true, exactly
    // as the column does.
    if (master?.paymentsEnabledGlobal === false) return false;
    if (isPlatformScope(tenantId)) return true;
    return tenant?.paymentsEnabled !== false;
  } catch (e) {
    // Fail OPEN. This gate exists to let the owner stop payments deliberately, not to
    // stop them by accident: a DB blip that silently made every paid funnel free would
    // cost real money and show no error anywhere.
    console.error("[payments] switch read failed:", e instanceof Error ? e.message : String(e));
    return true;
  }
}
