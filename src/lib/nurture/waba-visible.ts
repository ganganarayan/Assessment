import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";

/**
 * Is the WhatsApp sender visible to this scope?
 *
 * Parked by default. The sender works, but handing it to customers needs template
 * approval, per-tenant numbers and the failure modes both of those bring, and a feature
 * that half-works in front of a paying customer is worse than one they cannot see.
 *
 * Hidden behind a switch rather than deleted, for two reasons: turning it back on is a
 * click instead of a revert, and every tenant's stored WhatsApp config stays exactly
 * where it is, so nothing anyone already set up is lost in the meantime.
 *
 * The owner's own INTERNAL tenants (Tenant.unlimited) always see it, because they are
 * already using it and parking a feature for customers should not take it away from
 * the businesses that depend on it. Same rule as the built-in AI prompts.
 */
export async function wabaVisible(tenantId: string | null): Promise<boolean> {
  try {
    const s = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { wabaEnabledGlobal: true },
    });
    if (s?.wabaEnabledGlobal) return true;
    if (isPlatformScope(tenantId)) return true;
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId as string },
      select: { unlimited: true },
    });
    return t?.unlimited === true;
  } catch (e) {
    // Fail CLOSED. This gate exists to keep an unfinished feature out of sight, so a
    // DB blip must not be the thing that shows it to a customer.
    console.error("[waba] visibility read failed:", e instanceof Error ? e.message : String(e));
    return false;
  }
}
