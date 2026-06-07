import type { TenantSource } from "@/lib/tenant/constants";

export interface ResolvedTenant {
  slug: string | null;
  source: TenantSource;
}

/**
 * Pure host -> tenant resolution. No DB / framework dependencies so it is
 * trivially testable and reusable in middleware (edge) and server code.
 *
 * Rules:
 *  - host === rootDomain (or www.rootDomain)        -> root (no tenant)
 *  - host === "<slug>.rootDomain"                    -> subdomain tenant
 *  - anything else                                   -> custom domain
 *    (the caller must look up the Domain record to map host -> tenant slug)
 */
export function resolveTenantFromHost(
  rawHost: string,
  rootDomain: string,
): ResolvedTenant {
  const host = stripPort(rawHost).toLowerCase();
  const root = stripPort(rootDomain).toLowerCase();

  if (host === root || host === `www.${root}`) {
    return { slug: null, source: "root" };
  }

  if (host.endsWith(`.${root}`)) {
    const slug = host.slice(0, -1 * (root.length + 1));
    // Guard against multi-level leftovers like "a.b.root".
    if (slug && !slug.includes(".")) {
      return { slug, source: "subdomain" };
    }
  }

  return { slug: null, source: "custom-domain" };
}

function stripPort(host: string): string {
  return host.split(":")[0] ?? host;
}
