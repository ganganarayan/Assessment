import { Role } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { isPlatformOwner } from "@/lib/auth/platform";

/**
 * Break-glass password recovery. Sets a NEW password on a user's credential
 * account (hashed with Better Auth's own hasher so email+password sign-in
 * verifies it), marks the email verified, and clears the force-change flag so
 * sign-in works immediately.
 *
 * Business logic only — callers (the CLI script, the gated /api/admin/recover
 * route) decide WHO is allowed to invoke it. Pass `superAdminOnly` to refuse
 * anything but a SUPER_ADMIN account (limits the blast radius of a leaked
 * recovery secret to the platform owner, never a tenant admin). Pass
 * `promoteOwner` so that, when the target email is the configured platform
 * owner (PLATFORM_OWNER_EMAIL) but has been demoted, it is restored to
 * SUPER_ADMIN (tenantId → null) as part of the reset — the owner can always
 * self-restore, and the reachable set stays limited to that one email.
 */
export type RecoverResult =
  | { ok: true; email: string; promoted: boolean }
  | { ok: false; error: string };

export async function resetCredentialPassword(
  emailRaw: string,
  newPassword: string,
  opts: { superAdminOnly?: boolean; promoteOwner?: boolean } = {},
): Promise<RecoverResult> {
  const email = emailRaw.trim();
  if (!email) return { ok: false, error: "Email is required." };
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  // Case-insensitive match — Better Auth does not guarantee a stored casing.
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, role: true },
  });
  if (!user) return { ok: false, error: "No user with that email." };

  const isSuper = user.role === Role.SUPER_ADMIN;
  // The configured platform owner may self-restore even if currently demoted.
  const willPromote = !isSuper && !!opts.promoteOwner && isPlatformOwner(user.email);
  if (opts.superAdminOnly && !isSuper && !willPromote) {
    return { ok: false, error: "That account is not a super admin." };
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(newPassword);

  const existing = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: hashed } });
  } else {
    await prisma.account.create({
      data: { accountId: user.id, providerId: "credential", password: hashed, userId: user.id },
    });
  }

  if (willPromote) {
    // Restore full platform-owner scope alongside the password reset.
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, mustChangePassword: false, role: Role.SUPER_ADMIN, tenantId: null },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, mustChangePassword: false },
    });
  }

  return { ok: true, email: user.email, promoted: willPromote };
}
