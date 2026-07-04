import "server-only";
import { cookies } from "next/headers";
import { requireUser, isSuperAdmin, type AuthUser } from "@/lib/auth/guards";

/**
 * The "acting tenant" — the tenant whose workspace the current user is operating in.
 *  - A tenant admin always acts as their own tenant.
 *  - A super admin acts as the tenant they've "entered" (impersonation cookie); when
 *    they haven't entered one, tenantId is null = the platform-wide global view.
 * Every workspace data function scopes by this tenantId (Stage 3).
 */
export const ACTING_TENANT_COOKIE = "acting_tenant";

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
