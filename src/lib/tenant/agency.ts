import "server-only";
import { prisma } from "@/lib/db/prisma";
import { readActingTenant } from "@/lib/tenant/acting-cookie";

/**
 * Who may act as which workspace, for an AGENCY ADMIN.
 *
 * 🟢 WHY THERE IS NO NEW AUTHORIZATION MODEL. An agency admin needs to operate several
 * workspaces, and the app already has a mechanism for exactly that: the acting-tenant
 * cookie the super admin uses to enter a tenant. So this widens "who may read that
 * cookie" from the super admin alone to the super admin OR the agency admin above the
 * named workspace. A membership table would have been a second answer to a question the
 * codebase had already answered, and every scope helper would have had to learn it.
 *
 * 🔴 THE COOKIE IS NOT TRUST. It is user-writable in principle, so the parent link is
 * re-read from the database on every request and a workspace that is not an agency
 * tenant of the caller's own workspace resolves to null. Nothing else in the request
 * decides this: not a session field, not a claim.
 *
 * 🔴 AND IT IS NOT IMPERSONATION. The super admin's `impersonating` flag means "bypass
 * the caps and gates" all over /w (see assertCanCreateAssessment call sites), which is
 * right for the platform owner and would be a hole here: an agency tenant is entitled to
 * the agency-tenant unit, not to everything. An agency admin inside an agency tenant is
 * reported as `viaAgency`, a separate flag no gate consults.
 */

/**
 * The agency tenant this agency admin has entered, or null when they have entered
 * nothing, entered their own workspace, or named a workspace that is not theirs.
 *
 * A soft-deleted agency tenant is never enterable: its logins are already blocked and
 * its funnels stopped, so letting the agency admin in would show a business that is
 * supposed to be inert.
 */
export async function enteredAgencyTenant(userId: string, ownTenantId: string): Promise<string | null> {
  const acting = await readActingTenant(userId);
  if (!acting || acting === ownTenantId) return null;
  const target = await prisma.tenant.findFirst({
    where: { id: acting, agencyAdminTenantId: ownTenantId, deletedAt: null },
    select: { id: true },
  });
  return target?.id ?? null;
}

/**
 * Whether `tenantId` is an active agency tenant of `agencyAdminTenantId`. The check the
 * Enter action runs before it writes the cookie, and the one any agency-scoped mutation
 * runs before it touches a workspace that is not the caller's own.
 */
export async function isAgencyTenantOf(tenantId: string, agencyAdminTenantId: string): Promise<boolean> {
  const row = await prisma.tenant.findFirst({
    where: { id: tenantId, agencyAdminTenantId, deletedAt: null },
    select: { id: true },
  });
  return row != null;
}

/** The ids of an agency admin's active agency tenants. Empty for everyone else. */
export async function agencyTenantIds(agencyAdminTenantId: string): Promise<string[]> {
  const rows = await prisma.tenant.findMany({
    where: { agencyAdminTenantId, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.id);
}
