"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { auth } from "@/lib/auth/auth";
import { type ActionResult } from "@/features/assessment/actions/shared";

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

  // Keep THIS session alive and revoke the rest. Capture the token before the write.
  const before = await getSession();
  const keepToken = before?.session.token ?? null;

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(pw);
  const acct = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" }, select: { id: true } });
  if (acct) {
    await prisma.account.update({ where: { id: acct.id }, data: { password: hashed } });
  } else {
    await prisma.account.create({ data: { accountId: user.id, providerId: "credential", password: hashed, userId: user.id } });
  }
  await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });

  // A changed password must not leave an old session alive on another device.
  await prisma.session
    .deleteMany({ where: { userId: user.id, ...(keepToken ? { NOT: { token: keepToken } } : {}) } })
    .catch(() => {});

  return { ok: true };
}
