import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";

/** Get the current session on the server (or null if signed out). */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Get the current user, or null. */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}
