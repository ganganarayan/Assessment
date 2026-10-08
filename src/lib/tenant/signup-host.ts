import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveTenantFromHost } from "@/lib/tenant/resolve";

/**
 * May an account be created on THIS host?
 *
 * Only on the platform's own. A tenant's subdomain or custom domain is that tenant's
 * shop front, not a place to sell the product from: the platform owner takes the
 * signups, and a stranger landing on a customer's domain must not be able to open a
 * workspace of their own there.
 *
 * It matters more than it sounds, because these hosts get INDEXED. The Apply Gita
 * domain was the platform's address before the move, so it is in Google carrying the
 * old pages - which means real strangers arrive on a tenant's host and find a Sign Up
 * button that should never have been theirs to press.
 *
 * 🔴 Takes a HOST rather than reading request headers, so it works in an API route.
 * Middleware does not run for /api (the matcher excludes it), so the usual
 * getCurrentTenant() - which reads headers middleware injects - resolves to nothing
 * there. A guard that silently passes on the one path that actually creates the
 * account is not a guard; hiding the button is decoration without this.
 */
export async function signupAllowedOnHost(rawHost: string): Promise<boolean> {
  const host = rawHost.split(":")[0]?.toLowerCase() ?? "";
  if (!host) return true;

  const { slug, source } = resolveTenantFromHost(host, process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "");

  if (source === "subdomain" && slug) {
    const t = await prisma.tenant.findFirst({ where: { slug, deletedAt: null }, select: { id: true } });
    return !t;
  }

  if (source === "custom-domain") {
    const d = await prisma.domain.findUnique({
      where: { hostname: host },
      select: { tenant: { select: { deletedAt: true } } },
    });
    // An unknown host is NOT a tenant's - it is the platform reached by some address
    // the Domain table has never heard of, which is how localhost, a preview URL and
    // the Railway hostname all behave. Refusing there would lock signup out of every
    // environment that is not production.
    if (!d) return true;
    return !!d.tenant?.deletedAt;
  }

  return true;
}
