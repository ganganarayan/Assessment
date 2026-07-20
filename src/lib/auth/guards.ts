import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isPlatformOwner } from "@/lib/auth/platform";
import { ACTING_TENANT_COOKIE } from "@/lib/tenant/constants";

/** The session user shape we rely on (Better Auth surfaces role + tenantId + staffPermission). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  tenantId?: string | null;
  /** NULL = full-access owner/admin; "VIEW" = read-only staff; "EDIT" = editor staff. */
  staffPermission?: string | null;
}

/** A staff member (limited account) vs. a full-access owner/admin. */
export function isStaff(user: { staffPermission?: string | null }): boolean {
  return user.staffPermission === "VIEW" || user.staffPermission === "EDIT";
}

/** Whether the CURRENT signed-in user may edit — for server components/pages to
 *  hide edit controls from VIEW-only staff. Reads the session (no redirect). */
export async function currentUserCanEdit(): Promise<boolean> {
  const session = await getSession();
  return session ? canEdit(session.user as AuthUser) : false;
}

/** May this user MUTATE within their scope? Owners/admins (null) and EDIT staff yes;
 *  VIEW staff no. The single source of truth for the read-only vs. edit gate. */
export function canEdit(user: { staffPermission?: string | null }): boolean {
  return user.staffPermission !== "VIEW";
}

/** For a mutation Server Action: returns an error result to bail with when the
 *  caller is view-only, else null to proceed. */
export function editDenied(user: { staffPermission?: string | null }): { ok: false; error: string } | null {
  return canEdit(user) ? null : { ok: false, error: "You have view-only access — ask an admin for edit rights." };
}

/** THROW when the caller is view-only — for mutation actions whose return type is
 *  not ActionResult (so a graceful error object wouldn't type-check). Safe: the
 *  write never runs. */
export function assertCanEditOrThrow(user: { staffPermission?: string | null }): void {
  if (!canEdit(user)) throw new Error("View-only access — ask an admin for edit rights.");
}

/**
 * Require a FULL owner/admin (never a staff member) — for staff management and any
 * owner-only action. Staff (even EDIT) are redirected away.
 */
export async function requireOwnerAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (isStaff(user)) redirect(isSuperAdmin(user) ? "/admin" : "/w");
  return user;
}

/**
 * Require an authenticated user in a Server Component / Action.
 * Redirects to /sign-in when there is no valid session.
 */
export async function requireUser(): Promise<AuthUser> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user as AuthUser;
}

/** True for the platform owner: DB role SUPER_ADMIN, OR the bootstrap owner email
 *  (so the first owner is never locked out before their role is set). */
export function isSuperAdmin(user: { role?: string | null; email: string }): boolean {
  return user.role === "SUPER_ADMIN" || isPlatformOwner(user.email);
}

/**
 * Require the platform owner (super admin) — the platform console + tenant
 * management. Authenticated non-super users are sent to their tenant workspace.
 */
export async function requireSuperAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  // Non-super users belong in their tenant workspace (/w); if they have no tenant,
  // /w bounces them to /dashboard to self-provision.
  if (!isSuperAdmin(user)) redirect("/w");
  return user;
}

/**
 * Require a TENANT admin and return their tenant scope. A tenant admin is a
 * non-super user with a tenantId. (Super-admin impersonation — acting *as* a
 * tenant — is resolved separately in Stage 2 via the acting-tenant context.)
 * Redirects a tenant-less user to the info dashboard.
 */
export async function requireTenantAdmin(): Promise<{ user: AuthUser; tenantId: string }> {
  const user = await requireUser();
  const tenantId = user.tenantId ?? null;
  if (!tenantId) redirect("/dashboard");
  return { user, tenantId };
}

/**
 * Guard for the /w tenant workspace: always resolves a CONCRETE acting tenant.
 *  - Tenant admin → their own tenant (read fresh from DB, since the session copy can
 *    be stale right after self-provisioning).
 *  - Super admin → the tenant they've "entered" (impersonation); if none, back to the
 *    platform console to pick one.
 * Every /w data query scopes by the returned tenantId.
 */
export async function requireWorkspace(): Promise<{ user: AuthUser; tenantId: string; impersonating: boolean }> {
  const user = await requireUser();
  if (isSuperAdmin(user)) {
    const acting = (await cookies()).get(ACTING_TENANT_COOKIE)?.value || null;
    if (!acting) redirect("/platform");
    return { user, tenantId: acting, impersonating: true };
  }
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { tenantId: true } });
  if (!fresh?.tenantId) redirect("/dashboard");
  return { user, tenantId: fresh.tenantId, impersonating: false };
}
