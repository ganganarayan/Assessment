import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentTenant } from "@/lib/tenant/context";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import { enteredAgencyTenant } from "@/lib/tenant/agency";
import { isRailwayRoutedHost } from "@/lib/tenant/served-host";
import { PLATFORM_TENANT_ID, isBusinessTenant, isPlatformScope } from "@/lib/tenant/platform-tenant";
import { funnelVisibleOnHost, ownerOrPlatformVisibleOnHost } from "@/lib/tenant/public-host-rule";

/**
 * "May THIS hostname serve THIS funnel?" - the question asked by the public routes.
 *
 * The rule itself is in lib/tenant/public-host-rule.ts, pure and build-gated. This
 * module only resolves its three inputs from the request, and answers the one
 * authorisation question that can override it.
 *
 * 🟢 THE HOST ANSWER IS NOT A NEW MECHANISM. `src/middleware.ts` already resolves the
 * host to a tenant and injects it into request headers; `getCurrentTenant()` already
 * turns that into the Tenant row, Domain table included. This asks that one question
 * and compares the answer with the funnel's stored owner.
 */

/** The owner of the hostname this request arrived on. `null` from getCurrentTenant is
 *  the root/marketing host, which IS the platform - see platform-tenant.ts. */
const hostOwner = cache(async (): Promise<string> => {
  const t = await getCurrentTenant();
  return t?.id ?? PLATFORM_TENANT_ID;
});

/**
 * Does this owning tenant have a WORKING public hostname of its own? See the rule
 * module for why this question decides whether the platform host stands in for it.
 *
 * 🔴 NOT "does it have a Domain row". A row is an intention; routing is the fact, and
 * the two come apart. On 02-11-2026 cosmetic-divine-leads had a row for
 * assess.divineleads.guru with DNS pointed, and the host still answered Railway's
 * "Application not found" because the service's custom-domain cap had been hit - so its
 * three published funnels had exactly one working address, the platform's. Reading the
 * row as a home would have 404'd all three off the only host they had, which is the
 * same mistake as ignoring the carve-out altogether, just better hidden.
 *
 * So the question goes to Railway's own routed list, which is what decides whether a
 * request can physically arrive on that host at all.
 */
const ownerHasOwnHost = cache(async (ownerTenantId: string): Promise<boolean> => {
  const rows = await prisma.domain.findMany({
    where: { tenantId: ownerTenantId },
    select: { hostname: true },
  });
  for (const r of rows) {
    if (await isRailwayRoutedHost(r.hostname)) return true;
  }
  return false;
});

/** Is this request's hostname allowed to serve a funnel owned by `ownerTenantId`? */
export async function funnelServedHere(ownerTenantId: string | null): Promise<boolean> {
  const hostTenantId = await hostOwner();
  // Asked with `ownerHasOwnHost: true` first because that answer needs no Domain
  // lookup: a funnel on its OWN host is allowed whatever else is true. So ordinary ad
  // traffic on a tenant's own domain never pays for the extra query - only a request
  // whose host and owner already disagree reaches it.
  if (funnelVisibleOnHost({ hostTenantId, ownerTenantId, ownerHasOwnHost: true })) return true;
  // The one remaining way through is the platform host standing in for a business
  // tenant that has no host of its own.
  if (!isPlatformScope(hostTenantId) || !isBusinessTenant(ownerTenantId)) return false;
  return funnelVisibleOnHost({
    hostTenantId,
    ownerTenantId,
    ownerHasOwnHost: await ownerHasOwnHost(ownerTenantId),
  });
}

/** Is this request's hostname allowed to serve a result owned by `ownerTenantId`? */
export async function ownerOrPlatformServedHere(ownerTenantId: string | null): Promise<boolean> {
  return ownerOrPlatformVisibleOnHost({ hostTenantId: await hostOwner(), ownerTenantId });
}

/**
 * May the person looking at this see this tenant's funnel from ANOTHER tenant's host,
 * or while it is still a draft?
 *
 * One predicate for both questions because it is one question: is this signed-in person
 * authorised for the funnel's owner. Without it the owner previewing an Apply Gita
 * funnel from the platform console would 404 on himself - the same bypass the draft
 * preview already needed, now needed for the host check too.
 *
 * Deliberately returns false rather than redirecting: a stranger who guesses the URL
 * gets the same 404 an unknown slug gives, and is told nothing about whether it exists.
 *
 * Request-deduped, and never on the hot path: both callers reach it only after a check
 * has already failed, so ad traffic never pays for the session read.
 */
export const mayViewAcrossTenants = cache(
  async (ownerTenantId: string | null): Promise<boolean> => {
    const user = await getCurrentUser();
    if (!user) return false;
    // The platform owner, whether or not they have entered a workspace.
    if (isSuperAdmin(user)) return true;
    // Fresh read: a session's tenantId can be stale if assignment changed mid-session.
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tenantId: true },
    });
    const own = fresh?.tenantId ?? null;
    if (!own) return false;
    if (own === ownerTenantId) return true;
    // An agency admin who has entered one of their workspaces is looking at THAT
    // workspace's funnel, which will never match their own tenant id.
    const entered = await enteredAgencyTenant(user.id, own);
    return !!entered && entered === ownerTenantId;
  },
);
