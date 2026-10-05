"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { isStaff } from "@/lib/auth/guards";
import { isPlatformOwner } from "@/lib/auth/platform";
import { resolveActingScope } from "@/lib/tenant/acting";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The logins that belong to the workspace you are currently in - and the one place
 * that can set one of their passwords.
 *
 * 🔴 Why this exists. Settings used to offer exactly one password control: "Change
 * password", wired to the SIGNED-IN user. Impersonation does not change who the
 * session belongs to, so a super admin who entered a tenant and used it changed their
 * OWN password while believing they were fixing the tenant's. The tenant stayed locked
 * out, the owner's own credentials silently moved, and (before the fix in
 * changeOwnPassword) the session was revoked on the way out - "it logged out and did
 * nothing". A control that acts on somebody other than the account named on the screen
 * has to be a different control, not the same one in a different context.
 */

export interface WorkspaceLogin {
  id: string;
  name: string;
  email: string;
  /** NULL = full admin; "VIEW"/"EDIT" = staff. */
  staffPermission: string | null;
  /** True while a super-admin-set password is still waiting to be changed. */
  mustChangePassword: boolean;
  /** No credential account yet - this login cannot sign in with a password at all. */
  noPassword: boolean;
}

/** Every active login attached to the acting workspace. Owner/admin only. */
export async function listWorkspaceLogins(): Promise<ActionResult<WorkspaceLogin[]>> {
  const scope = await resolveActingScope();
  if (!scope.tenantId) return { ok: false, error: "Enter a workspace to manage its logins." };
  if (isStaff(scope.user)) return { ok: false, error: "Only an owner can manage logins." };

  const users = await prisma.user.findMany({
    where: { tenantId: scope.tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      staffPermission: true,
      mustChangePassword: true,
      accounts: { where: { providerId: "credential" }, select: { password: true } },
    },
    orderBy: [{ staffPermission: "asc" }, { createdAt: "asc" }],
  });

  return {
    ok: true,
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      staffPermission: u.staffPermission ?? null,
      mustChangePassword: u.mustChangePassword,
      noPassword: !u.accounts.some((a) => !!a.password),
    })),
  };
}

/**
 * Set the password of a login INSIDE the acting workspace.
 *
 * Authorization is the workspace boundary itself: the target must belong to the tenant
 * the caller is acting as, which a tenant admin can only ever be their own and a super
 * admin only one they have explicitly entered. The platform owner is never a target -
 * that account recovers through Forgot password or the break-glass script, so a tenant
 * screen can never reach it.
 */
export async function setWorkspaceUserPassword(userId: string, newPassword: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  if (!scope.tenantId) return { ok: false, error: "Enter a workspace to manage its logins." };
  if (isStaff(scope.user)) return { ok: false, error: "Only an owner can set a password." };

  const pw = (newPassword ?? "").trim();
  if (pw.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: scope.tenantId, deletedAt: null },
    select: { id: true, email: true },
  });
  if (!target) return { ok: false, error: "That login isn't in this workspace." };
  if (isPlatformOwner(target.email)) {
    return { ok: false, error: "The platform owner's password can't be set from a workspace." };
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(pw);
  const acct = await prisma.account.findFirst({
    where: { userId: target.id, providerId: "credential" },
    select: { id: true },
  });
  if (acct) {
    await prisma.account.update({ where: { id: acct.id }, data: { password: hashed } });
  } else {
    await prisma.account.create({
      data: { accountId: target.id, providerId: "credential", password: hashed, userId: target.id },
    });
  }

  // Mark the email verified alongside the set: a login whose password an owner just
  // handed over must not then be stopped by an unverified-email gate it cannot clear.
  // Force a change on first use, and drop their existing sessions so the old password
  // stops working everywhere immediately.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { mustChangePassword: true, emailVerified: true },
    }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
  ]);

  revalidatePath("/admin/settings");
  revalidatePath("/w/settings");
  return { ok: true };
}
