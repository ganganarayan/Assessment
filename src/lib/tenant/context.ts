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

  // A soft-deleted tenant resolves to nothing, on BOTH paths. "Deleted" has to mean
  // the public surface stops - otherwise its subdomain and custom domains keep serving
  // and keep collecting leads into a business the owner believes is gone.
  if (source === "subdomain" && slug) {
    return prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      include: { theme: true },
    });
  }

  if (source === "custom-domain" && host) {
    const domain = await prisma.domain.findUnique({
      where: { hostname: host },
      include: { tenant: { include: { theme: true } } },
    });
    if (!domain) return null;
    // 🔴 Deliberately NOT gated on `verified`. That flag tracks CERTIFICATE issuance,
    // which is a provisioning milestone, not a statement about who owns the host - and
    // it goes stale: a valid Railway cert reported as CERTIFICATE_STATUS_TYPE_VALID
    // failed certIsLive's word list, so `verified` stayed false and this returned null.
    // The visible result was the tenant's own domain serving the PLATFORM's landing
    // page, identical to assess360's, with nothing to suggest why.
    //
    // The honest test is the one that already happened: the hostname column is globally
    // unique, so only one tenant can ever claim a host, and a request only ARRIVES here
    // because that host is routed to us. Row + arrival is proof of ownership; a
    // certificate's status is not. Point the DNS and it serves - no "Check status" step.
    return domain.tenant.deletedAt ? null : domain.tenant;
  }

  return null;
}
