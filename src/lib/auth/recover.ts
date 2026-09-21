import { Role } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

/**
 * Break-glass password recovery. Sets a NEW password on a user's credential
 * account (hashed with Better Auth's own hasher so email+password sign-in
 * verifies it), marks the email verified, and clears the force-change flag so
 * sign-in works immediately.
 *
 * Business logic only — callers (the CLI script, the gated /api/admin/recover
 * route) decide WHO is allowed to invoke it. Pass `superAdminOnly` to refuse
 * anything but a SUPER_ADMIN account (limits the blast radius of a leaked
 * recovery secret to the platform owner, never a tenant admin).
 */
export type RecoverResult = { ok: true; email: string } | { ok: false; error: string };

export async function resetCredentialPassword(
  emailRaw: string,
  newPassword: string,
  opts: { superAdminOnly?: boolean } = {},
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
  if (opts.superAdminOnly && user.role !== Role.SUPER_ADMIN) {
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

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, mustChangePassword: false },
  });

  return { ok: true, email: user.email };
}
