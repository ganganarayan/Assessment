import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

/**
 * Require an authenticated user in a Server Component / Action.
 * Redirects to /sign-in when there is no valid session.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}
