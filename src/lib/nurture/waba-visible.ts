import "server-only";
import { featureAllowedFor } from "@/lib/features/release";

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
 *
 * SINCE THE RELEASE SWITCHES: this is the "whatsapp" key in lib/features/catalog, and
 * this function is a thin alias kept for its five call sites. The behaviour is
 * unchanged - one platform-wide switch, the owner's scope exempt, failing closed on a
 * read error (the key's catalog default is off) - the difference being that WhatsApp is
 * no longer the only feature that can be held back, and the switch now lives in one
 * place with the others instead of in a column of its own.
 */
export async function wabaVisible(tenantId: string | null): Promise<boolean> {
  return featureAllowedFor("whatsapp", tenantId);
}
