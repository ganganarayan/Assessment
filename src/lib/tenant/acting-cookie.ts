import "server-only";
import { cookies } from "next/headers";
import { ACTING_TENANT_COOKIE } from "@/lib/tenant/constants";

/**
 * The impersonation cookie, read and written in ONE place.
 *
 * 🔴 Why it is bound to a user id. The cookie used to hold a bare tenant id with no
 * expiry and nothing tying it to the session that set it, and nothing ever deleted it
 * but the Exit button. So it outlived sign-out: the next super admin to sign in on that
 * browser - including the same person, hours later - silently landed INSIDE whichever
 * tenant was last entered, and every /admin screen showed that tenant's rows under a
 * banner they had no reason to expect. One stale cookie is the whole bug.
 *
 * The value is now `<userId>.<tenantId>`, and a read returns the tenant only when the
 * id matches the caller. Both ids are cuids (alphanumeric), so "." can never appear
 * inside one and the split is unambiguous.
 *
 * A legacy bare value - one already sitting in a browser from before this change - has
 * no user id, so it fails the match and is ignored. Nobody has to clear anything by
 * hand; the first page load after the deploy drops out of impersonation.
 */

/** The tenant this user has entered, or null. Ignores a cookie set by anyone else. */
export async function readActingTenant(userId: string): Promise<string | null> {
  const raw = (await cookies()).get(ACTING_TENANT_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null; // legacy bare tenant id, or malformed - not ours
  return raw.slice(0, dot) === userId ? raw.slice(dot + 1) || null : null;
}

/** Enter a tenant: bind the cookie to the super admin who entered it. */
export async function writeActingTenant(userId: string, tenantId: string): Promise<void> {
  (await cookies()).set(ACTING_TENANT_COOKIE, `${userId}.${tenantId}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

/** Leave impersonation. Safe to call for anyone, signed in or not. */
export async function clearActingTenant(): Promise<void> {
  (await cookies()).delete(ACTING_TENANT_COOKIE);
}
