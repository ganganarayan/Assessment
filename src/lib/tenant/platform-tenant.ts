/**
 * The Platform tenant - the SaaS itself, as a real Tenant row.
 *
 * WHY A FIXED ID, NOT A CUID
 * Every other tenant gets `@default(cuid())`. This one is pinned to the literal
 * string "platform" so that recognising it is a string compare instead of a DB
 * lookup - `isPlatformTenant()` is called on hot paths (billing gates, Meta config
 * resolution) where an extra query per request would be a real cost, and a cached
 * lookup would need invalidation for a row that never changes.
 *
 * WHAT LIVES HERE vs. IN A BUSINESS TENANT
 * The Platform tenant holds the SaaS: the owner's User row, the singleton
 * AppSetting (the platform's own pixel, legal details, AI keys), and the
 * platform's own analytics. It does NOT hold a funnel. The owner's funnel
 * business (Apply Gita) is a SEPARATE tenant that the owner *enters* to operate.
 * That split is what keeps "run my funnel" distinct from "administer the SaaS",
 * and it matches the domain split (platform on its own apex, the funnel on its).
 *
 * TRANSITION
 * Before the re-home, platform-owned rows carry `tenantId = null`. During the
 * transition both spellings mean the same thing, which is why
 * `isPlatformScope()` accepts null as well. Once every null is backfilled and the
 * columns are NOT NULL, the null arm goes away and only the id remains.
 */

/**
 * The Tenant.id of the Platform tenant. Seeded by the
 * 20260930000000_platform_tenant migration (slug "platform", name
 * "Assess360 Platform", plan SCALE) - never generated at runtime.
 */
export const PLATFORM_TENANT_ID = "platform";

/** True when this tenant id is the Platform tenant. */
export function isPlatformTenant(tenantId: string | null | undefined): boolean {
  return tenantId === PLATFORM_TENANT_ID;
}

/**
 * True when this owning-tenant id denotes the platform's own scope.
 *
 * Accepts null ONLY for the transition: rows written before the re-home carry
 * `tenantId = null`, and the billing gates and settings resolution must treat
 * those identically to the Platform tenant or a live funnel changes behaviour
 * mid-migration. Delete the null arm once the backfill is done and the columns
 * are NOT NULL.
 */
export function isPlatformScope(tenantId: string | null | undefined): boolean {
  return tenantId === null || tenantId === undefined || isPlatformTenant(tenantId);
}

/**
 * True when this id is a real BUSINESS tenant - i.e. not the platform and not a legacy
 * null. Written as a type predicate so that `if (!isBusinessTenant(id)) return ...`
 * narrows `id` to `string` for the rest of the function; the gates below it index
 * per-tenant tables by that id, and TypeScript has to know it cannot be null.
 */
export function isBusinessTenant(tenantId: string | null | undefined): tenantId is string {
  return !isPlatformScope(tenantId);
}

/**
 * A where-fragment matching the rows OWNED by `owner`, in both spellings.
 *
 * 🔴 THE BUG THIS EXISTS TO KILL. The platform's own rows exist under two owners at
 * once: `PLATFORM_TENANT_ID` (everything written since the re-home) and `null`
 * (everything written before it, because the backfill has not run). A screen that
 * pinned one spelling listed half the data and hid the other half - and when the write
 * path picked the id while the read path picked the null, the owner created a webhook,
 * was told it was created, and watched the list stay empty.
 *
 * So anything platform-scoped is matched as EITHER spelling until the backfill makes
 * the columns NOT NULL, at which point this collapses to `{ tenantId: owner }` and the
 * OR arm goes away with the rest of the transition.
 *
 * A BUSINESS tenant is matched by its id alone - the bridge is only ever between the
 * platform and the legacy null, never across tenants.
 */
export type OwnedWhere = { tenantId: string } | { OR: { tenantId: string | null }[] };

export function ownedWhere(owner: string | null | undefined): OwnedWhere {
  // Written as the business case first because that is the type predicate: it narrows
  // `owner` to a string, so the bridge below cannot be reached with a real tenant id.
  if (isBusinessTenant(owner)) return { tenantId: owner };
  return { OR: [{ tenantId: PLATFORM_TENANT_ID }, { tenantId: null }] };
}
