import "server-only";
import { prisma } from "@/lib/db/prisma";
import { requireUser, isSuperAdmin, canEdit, type AuthUser } from "@/lib/auth/guards";
import { ACTING_TENANT_COOKIE } from "@/lib/tenant/constants";
import { readActingTenant } from "@/lib/tenant/acting-cookie";
import { PLATFORM_TENANT_ID } from "@/lib/tenant/platform-tenant";
import { tenantOnly, whereScope, type Scope } from "@/lib/tenant/scope";

/**
 * The "acting tenant" - the tenant whose workspace the current user is operating in.
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
    const acting = await readActingTenant(user.id);
    return { user, tenantId: acting, impersonating: !!acting };
  }
  // Read the tenant id FRESH from the DB: right after a tenant self-provisions, the
  // session copy can still be null/stale, which would silently scope their /w pages
  // to the wrong tenant (or none). Mirror resolveActingScope.
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { tenantId: true } });
  return { user, tenantId: fresh?.tenantId ?? user.tenantId ?? null, impersonating: false };
}

/**
 * The tenant a surface is scoped to: the tenant a super admin has "entered"
 * (impersonation), or null when they have not.
 *
 * 🟡 The null here means "no single tenant", NOT "the platform's own rows" - that
 * distinction is what the old code got wrong. Prefer `actingDataScope()` (rows to
 * show) or `actingConfigTenantId()` (config row to write), which say which of the two
 * they mean. This stays for callers that genuinely want "the entered tenant, if any",
 * such as rendering a workspace badge.
 */
export async function actingTenantId(): Promise<string | null> {
  return (await resolveActingTenant()).tenantId;
}

export interface ActingScope {
  user: AuthUser;
  /** Tenant to scope writes/reads to. null = super-admin global (edit anything). */
  tenantId: string | null;
  isSuper: boolean;
  /** False for VIEW-only staff - mutation actions must bail (assertScopeCanEdit). */
  canEdit: boolean;
}

/** For a mutation action using resolveActingScope(): returns an error result to
 *  return when the caller is view-only staff, else null to proceed. */
export function scopeEditDenied(scope: ActingScope): { ok: false; error: string } | null {
  return scope.canEdit ? null : { ok: false, error: "You have view-only access - ask an admin for edit rights." };
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
    const acting = await readActingTenant(user.id);
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
export function tenantScope(scope: ActingScope): { tenantId?: string | null } {
  return whereScope(dataScopeOf(scope));
}

/**
 * ---------------------------------------------------------------------------
 * The two questions a scope gets asked, and why they need separate answers
 * ---------------------------------------------------------------------------
 *
 * A super admin who has not entered a workspace used to be `tenantId = null`, and
 * that single value was read two incompatible ways:
 *
 *   "which ROWS do I show?"      → the read paths pinned `tenantId: null`, i.e. only
 *                                  the platform's own rows
 *   "which rows may I TOUCH?"    → tenantScope returned `{}`, i.e. every tenant
 *
 * Same state, opposite answers - which is why the same session produced a populated
 * Submissions list and an empty Stats page. There is also a third question hiding in
 * there: "which CONFIG row do I write?", which means the platform's own row and
 * nothing else.
 *
 * So there are two answers, and each gets its own accessor. Neither returns a bare
 * nullable string, so they cannot be confused at a call site again:
 *
 *   dataScopeOf()   → Scope. Lists, reports, exports, deletes. An owner with no
 *                     workspace entered gets { kind: "all" } - every tenant. That
 *                     matches what the write paths already did, and it is what a SaaS
 *                     owner console should show. It is ALSO what keeps the funnel
 *                     screens populated after the funnel moves to its own tenant:
 *                     scoped to the platform's own rows they would simply go empty,
 *                     because the platform does not run a funnel.
 *
 *   configTenantOf() → a non-null tenant id. Settings, AI keys, prompt versions,
 *                     nurture content. An owner with no workspace entered gets the
 *                     PLATFORM tenant, never "all": there is no such thing as writing
 *                     one settings value across every tenant.
 */

/**
 * Which rows this caller may read/act on.
 *
 * A super admin who has NOT entered a workspace scopes to the PLATFORM tenant - its own
 * rows - not to every tenant. Before the funnel was re-homed this returned ALL_TENANTS,
 * for a reason that has now expired: the funnel lived on no tenant at all, so a
 * platform-scoped console would have shown nothing and the owner's own screens would
 * have gone blank. The funnel now belongs to its tenant and is read by entering that
 * workspace, so "everything, everywhere" is no longer the owner's default view - it is
 * just every tenant's data pooled into one list with no indication of whose is whose.
 *
 * This answers reads AND writes (tenantScope wraps it), so it is also the authorization
 * boundary: a super admin edits a tenant's rows by ENTERING that workspace, which is
 * what the Enter button on /platform is for. Out-of-scope writes return a plain "isn't
 * in this workspace" error rather than failing silently.
 *
 * 🟡 Accepted consequence: there is no cross-tenant list any more. Adding one means an
 * explicitly owner-only screen that asks for ALL_TENANTS by name, which is the honest
 * way to express it - not a scope that quietly means "all" whenever nobody entered
 * anywhere.
 */
export function dataScopeOf(scope: ActingScope): Scope {
  if (scope.tenantId) return tenantOnly(scope.tenantId);
  if (scope.isSuper) return tenantOnly(PLATFORM_TENANT_ID);
  throw new Error("No workspace: caller has no tenant scope.");
}

/** Resolve the caller's data scope in one call (the common case for a page or route). */
export async function actingDataScope(): Promise<Scope> {
  return dataScopeOf(await resolveActingScope());
}

/**
 * The third question - "which tenant OWNS the row I am about to write?" - and the one
 * that cost an assessment.
 *
 * 🔴 THE BUG THIS EXISTS TO KILL. Writes stamped `scope.tenantId` directly. For a super
 * admin who has not entered a workspace that is `null`, so the row was saved unowned -
 * while `dataScopeOf` (above) sends the same caller's READS to the Platform tenant.
 * Written as null, searched for as "platform": an assessment created from /admin
 * disappeared the instant it was saved. It was never lost, and its public funnel served
 * fine; the console simply asked for an owner the row had never been given.
 *
 * So this returns a NON-NULLABLE id, and that type is the fix. `dataScopeOf` answers
 * "which rows may I see" and may legitimately be a whole tenant or none; this answers
 * "whose row is this" and there is no honest null - every row belongs to somebody. A
 * write site that tries to pass a nullable value now fails to compile instead of
 * silently orphaning a row, which is why the signature matters more than the body.
 *
 * The platform's own work is owned by the PLATFORM TENANT. That is what the Platform
 * tenant is for: "super admin" is a role, not a place to put rows. Nothing here rates,
 * meters or gates the owner - those are separate questions, answered by the billing
 * resolver, which treats the platform scope as unlimited.
 */
export function configTenantOf(scope: ActingScope): string {
  if (scope.tenantId) return scope.tenantId;
  if (scope.isSuper) return PLATFORM_TENANT_ID;
  throw new Error("No workspace: caller has no tenant to own this row.");
}

/** Resolve the owning tenant for a write in one call. Never null. */
export async function actingConfigTenantId(): Promise<string> {
  return configTenantOf(await resolveActingScope());
}
