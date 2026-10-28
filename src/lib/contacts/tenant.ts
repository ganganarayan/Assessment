import { PLATFORM_TENANT_ID } from "@/lib/tenant/platform-tenant";

/**
 * Who owns this contact.
 *
 * Contacts are a NEW table, so they skip the transitional spelling the older tables
 * carry: a platform funnel owns its contacts as the Platform tenant rather than as
 * null. That is not cosmetic. Postgres treats NULLs as distinct, so a nullable owner
 * would make the (tenant, mobile) key stop deduplicating for exactly the scope the
 * owner runs their own funnels in - every repeat visitor a second contact, and every
 * broadcast reaching them twice.
 *
 * 🟡 ITS OWN MODULE, pulled out of contacts/upsert.ts, and the reason is an import
 * cycle rather than tidiness. The upsert now fires workflow triggers, and the queue
 * reads this function: upsert -> enqueue -> upsert is a cycle that resolves to
 * undefined at module-init time if the wrong file loads first. One leaf module both
 * sides import instead. upsert.ts re-exports it, so nothing that imported it from
 * there had to change.
 */
export function contactTenantOf(tenantId: string | null | undefined): string {
  return tenantId ?? PLATFORM_TENANT_ID;
}
