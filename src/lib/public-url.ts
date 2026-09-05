import { env } from "@/lib/env";

/** Tenant shape needed to resolve an assessment's public host. */
export interface PublicHostTenant {
  slug: string;
  domains: { hostname: string; isPrimary: boolean }[];
}

/**
 * The public ORIGIN an assessment is served on, resolved from its tenant:
 *   1. a verified CUSTOM domain (the primary one, else any verified)  -> that host
 *   2. otherwise the tenant's PARENT (subdomain) host                 -> slug.<root>
 *   3. a platform (null-tenant) assessment                            -> null
 *
 * Returns null for the platform case so the caller can fall back to the browser's
 * own origin (window.location.origin) — i.e. exactly the host the operator is on,
 * which is what "copy the URL from the address bar" gives them. Never throws; the
 * domains list is assumed already filtered to verified.
 */
export function publicAssessmentBase(tenant: PublicHostTenant | null): string | null {
  const domains = tenant?.domains ?? [];
  const custom = domains.find((d) => d.isPrimary) ?? domains[0];
  if (custom) return `https://${custom.hostname}`;
  if (tenant?.slug) return `https://${tenant.slug}.${env.NEXT_PUBLIC_ROOT_DOMAIN}`;
  return null;
}
