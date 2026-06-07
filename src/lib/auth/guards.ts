import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";

/**
 * Require an authenticated user in a Server Component / Action.
 * Redirects to /sign-in when there is no valid session.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

/**
 * Require the platform owner (super admin). Used to guard /admin.
 * Authenticated non-owners are sent to their normal dashboard.
 */
export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!isPlatformOwner(user.email)) redirect("/dashboard");
  return user;
}
