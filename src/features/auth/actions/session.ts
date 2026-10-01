"use server";

import { clearActingTenant } from "@/lib/tenant/acting-cookie";

/**
 * Drop any impersonation before a sign-out or after a sign-in.
 *
 * The acting-tenant cookie is now bound to the super admin who set it, so a leftover
 * one is already ignored for anybody else. This closes the remaining case: the SAME
 * owner signing back in and silently resuming a workspace they entered hours ago.
 * Signing in should always land on your own surface, never mid-impersonation.
 *
 * Deliberately ungated — it only deletes a cookie, and it has to work for a caller
 * who is on their way out of (or into) a session.
 */
export async function endImpersonation(): Promise<void> {
  await clearActingTenant();
}
