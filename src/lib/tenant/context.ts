import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { TENANT_HEADERS, type TenantSource } from "@/lib/tenant/constants";

export interface TenantContext {
  slug: string | null;
  source: TenantSource;
  host: string;
}

/** Read the tenant context that middleware injected into request headers. */
export async function getTenantContext(): Promise<TenantContext> {
  const h = await headers();
  return {
    slug: h.get(TENANT_HEADERS.slug) || null,
    source: (h.get(TENANT_HEADERS.source) as TenantSource) || "root",
    host: h.get(TENANT_HEADERS.host) || "",
  };
}

/**
 * Load the current tenant record (or null on the root domain).
 *
 * Subdomains are resolved by slug (set in middleware). Custom domains are
 * resolved here via the Domain table, since edge middleware has no DB access.
 */
export async function getCurrentTenant() {
  const { slug, source, host } = await getTenantContext();

  if (source === "subdomain" && slug) {
    return prisma.tenant.findUnique({
      where: { slug },
      include: { theme: true },
    });
  }

  if (source === "custom-domain" && host) {
    const domain = await prisma.domain.findUnique({
      where: { hostname: host },
      include: { tenant: { include: { theme: true } } },
    });
    return domain?.verified ? domain.tenant : null;
  }

  return null;
}
