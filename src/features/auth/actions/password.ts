"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/auth";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Self-service password change for the signed-in user (Settings → Change password).
 * Verifies the CURRENT password via Better Auth, then sets the new one and signs out
 * other sessions. Distinct from forceSetOwnPassword (forced reset, no current check).
 */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<ActionResult> {
  await requireUser();
  const cur = (currentPassword ?? "").trim();
  const next = (newPassword ?? "").trim();
  if (next.length < 8) return { ok: false, error: "New password must be at least 8 characters." };
  if (!cur) return { ok: false, error: "Enter your current password." };
  try {
    await auth.api.changePassword({
      body: { currentPassword: cur, newPassword: next, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch {
    return { ok: false, error: "Couldn't change the password — check your current password." };
  }
  return { ok: true };
}

/**
 * Set the SIGNED-IN user's own password and clear the forced-change flag. Used by the
 * /change-password screen after a super admin set a temporary password — the user is
 * authenticated (they just logged in with the temp password), so no current-password
 * is required; this is a forced reset, not a self-service change.
 */
export async function forceSetOwnPassword(newPassword: string): Promise<ActionResult> {
  const user = await requireUser();
  const pw = (newPassword ?? "").trim();
  if (pw.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(pw);
  const acct = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" }, select: { id: true } });
  if (acct) {
    await prisma.account.update({ where: { id: acct.id }, data: { password: hashed } });
  } else {
    await prisma.account.create({ data: { accountId: user.id, providerId: "credential", password: hashed, userId: user.id } });
  }
  await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
  return { ok: true };
}
