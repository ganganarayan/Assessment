/** Header names used to pass resolved tenant context from middleware to app. */
export const TENANT_HEADERS = {
  /** Resolved tenant slug, or empty if on the root/marketing domain. */
  slug: "x-tenant-slug",
  /** How the tenant was resolved: "subdomain" | "custom-domain" | "root". */
  source: "x-tenant-source",
  /** The original hostname seen by middleware. */
  host: "x-tenant-host",
} as const;

export type TenantSource = "subdomain" | "custom-domain" | "root";
