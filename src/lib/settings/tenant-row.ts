import { isPlatformScope } from "@/lib/tenant/platform-tenant";

/**
 * AppSetting row addressing — ONE place that decides which row a given tenant's
 * settings live in.
 *
 * AppSetting.id defaults to the literal "singleton" (the platform's own row), so a
 * tenant row created WITHOUT an explicit id collides with that row's primary key —
 * the first save for any tenant that has no AppSetting row yet fails with P2002 and
 * takes the whole settings page down with it. Every tenant-scoped upsert therefore
 * passes an id, derived from the tenant id so it stays stable and unique per tenant
 * (the row is also keyed by the unique `tenantId`, so this is belt and braces).
 *
 * THE PLATFORM ROW HAS TWO NAMES, ON PURPOSE.
 * The platform's settings are the row with `id = "singleton"`. The re-home sets that
 * same row's `tenantId` to PLATFORM_TENANT_ID, so afterwards it is reachable both by
 * its id and by its tenant. Everything here funnels the platform — whether it arrives
 * as null (pre-re-home) or as "platform" (post) — to `{ id: "singleton" }`, so the
 * lookup hits the one row in both states.
 *
 * Getting this wrong is why it is centralised: an upsert that addressed the platform
 * by `{ tenantId: "platform" }` before the re-home would not match the singleton, and
 * would CREATE a second row — silently splitting the owner's settings in two, with
 * the live pixel and Razorpay keys in whichever half the reader happened to pick.
 */

/** Stable, unique AppSetting.id for a tenant's own row. */
export function tenantAppSettingId(tenantId: string): string {
  return isPlatformScope(tenantId) ? "singleton" : `tenant_${tenantId}`;
}

/**
 * The unique-where that addresses a tenant's AppSetting row. The platform (null or
 * PLATFORM_TENANT_ID) resolves to the singleton row by id; every other tenant by its
 * unique `tenantId`.
 */
export function appSettingWhere(tenantId: string | null | undefined): { id: string } | { tenantId: string } {
  return isPlatformScope(tenantId) ? { id: "singleton" } : { tenantId: tenantId as string };
}
