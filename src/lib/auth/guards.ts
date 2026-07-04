import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";

/** The session user shape we rely on (Better Auth surfaces role + tenantId). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  tenantId?: string | null;
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
  // Non-super users land on the info dashboard until their tenant workspace exists
  // (Stage 3). NOTE: /admin stays super-admin-only until the isolation pass is done.
  if (!isSuperAdmin(user)) redirect("/dashboard");
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
