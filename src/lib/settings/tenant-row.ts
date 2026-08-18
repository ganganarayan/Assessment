/**
 * AppSetting.id defaults to the literal "singleton" (the platform/Gita row), so a
 * tenant row created WITHOUT an explicit id collides with that row's primary key —
 * the first save for any tenant that has no AppSetting row yet fails with P2002 and
 * takes the whole settings page down with it.
 *
 * Every tenant-scoped upsert must therefore pass an id. It is derived from the
 * tenant id so it stays stable and unique per tenant (the row is also keyed by the
 * unique `tenantId`, so this is belt and braces).
 */
export function tenantAppSettingId(tenantId: string): string {
  return `tenant_${tenantId}`;
}
