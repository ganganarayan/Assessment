import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { requireUser, isSuperAdmin, canEdit, type AuthUser } from "@/lib/auth/guards";
import { ACTING_TENANT_COOKIE } from "@/lib/tenant/constants";

/**
 * The "acting tenant" — the tenant whose workspace the current user is operating in.
 *  - A tenant admin always acts as their own tenant.
 *  - A super admin acts as the tenant they've "entered" (impersonation cookie); when
 *    they haven't entered one, tenantId is null = the platform-wide global view.
 */
export { ACTING_TENANT_COOKIE };

export interface ActingTenant {
  user: AuthUser;
  tenantId: string | null;
  impersonating: boolean;
}

export async function resolveActingTenant(): Promise<ActingTenant> {
  const user = await requireUser();
  if (isSuperAdmin(user)) {
    const acting = (await cookies()).get(ACTING_TENANT_COOKIE)?.value || null;
    return { user, tenantId: acting, impersonating: !!acting };
  }
  return { user, tenantId: user.tenantId ?? null, impersonating: false };
}

/**
 * The tenant an /admin page should scope its data to: the tenant a super admin has
 * "entered" (impersonation), or null = the platform/Gita view when not impersonating.
 * Every /admin data read passes this so entering a tenant shows ONLY that tenant's
 * data (no super-admin data bleeds through impersonation).
 */
export async function actingTenantId(): Promise<string | null> {
  return (await resolveActingTenant()).tenantId;
}

export interface ActingScope {
  user: AuthUser;
  /** Tenant to scope writes/reads to. null = super-admin global (edit anything). */
  tenantId: string | null;
  isSuper: boolean;
  /** False for VIEW-only staff — mutation actions must bail (assertScopeCanEdit). */
  canEdit: boolean;
}

/** For a mutation action using resolveActingScope(): returns an error result to
 *  return when the caller is view-only staff, else null to proceed. */
export function scopeEditDenied(scope: ActingScope): { ok: false; error: string } | null {
  return scope.canEdit ? null : { ok: false, error: "You have view-only access — ask an admin for edit rights." };
}

/** For a mutation action that authorizes via assessmentInScope() (not the scope
 *  directly): resolve the scope and return the view-only error, else null. */
export async function assertEdit(): Promise<{ ok: false; error: string } | null> {
  return scopeEditDenied(await resolveActingScope());
}

/**
 * Resolve the caller's write/read scope for shared admin actions used by BOTH the
 * super-admin console (/admin) and a tenant workspace (/w):
 *  - Super admin, not impersonating → { tenantId: null, isSuper: true } = global.
 *  - Super admin, impersonating a tenant → that tenant, scoped.
 *  - Tenant admin → their own tenant (read fresh from DB; session copy can be stale).
 * Use tenantScope(scope) to turn it into a Prisma where-fragment.
 */
export async function resolveActingScope(): Promise<ActingScope> {
  const user = await requireUser();
  if (isSuperAdmin(user)) {
    const acting = (await cookies()).get(ACTING_TENANT_COOKIE)?.value || null;
    return { user, tenantId: acting, isSuper: true, canEdit: canEdit(user) };
  }
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true },
  });
  return { user, tenantId: fresh?.tenantId ?? null, isSuper: false, canEdit: canEdit(user) };
}

/** Prisma where-fragment for a scope: filter by tenant, or {} for super-global.
 *  Throws for a non-super caller with no tenant (they own nothing). */
export function tenantScope(scope: ActingScope): { tenantId?: string } {
  if (scope.tenantId) return { tenantId: scope.tenantId };
  if (scope.isSuper) return {};
  throw new Error("No workspace: caller has no tenant scope.");
}
