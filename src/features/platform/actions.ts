"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, isStaff } from "@/lib/auth/guards";

/** Tenant/user management is OWNER-only — never a staff member (even EDIT). */
const OWNER_ONLY = { ok: false as const, error: "Only an owner can manage tenants and users." };
import { isPlatformOwner } from "@/lib/auth/platform";
import { auth } from "@/lib/auth/auth";
import { ACTING_TENANT_COOKIE } from "@/lib/tenant/acting";
import { slugSchema } from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";

/** Super admin "enters" a tenant to operate its workspace as that tenant. */
export async function enterTenant(tenantId: string): Promise<void> {
  await requireSuperAdmin();
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (t) {
    (await cookies()).set(ACTING_TENANT_COOKIE, tenantId, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  redirect("/admin");
}

/** Leave impersonation and return to the platform console. */
export async function exitTenant(): Promise<void> {
  await requireSuperAdmin();
  (await cookies()).delete(ACTING_TENANT_COOKIE);
  redirect("/platform");
}

/**
 * Permanently delete a tenant AND all its data (assessments, submissions, domains,
 * webhooks, payments, settings…) via the DB cascade. DESTRUCTIVE + irreversible, so
 * it requires the caller to type the exact slug. Logins are PRESERVED: their tenant
 * link is cleared first so the cascade can't delete the user rows.
 */
export async function deleteTenant(tenantId: string, confirmSlug: string): Promise<ActionResult> {
  if (isStaff(await requireSuperAdmin())) return OWNER_ONLY;
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true } });
  if (!t) return { ok: false, error: "Tenant not found." };
  if ((confirmSlug ?? "").trim().toLowerCase() !== t.slug.toLowerCase()) {
    return { ok: false, error: `Type the slug "${t.slug}" exactly to confirm.` };
  }
  // Preserve logins: unassign before the FK cascade would delete them.
  await prisma.user.updateMany({ where: { tenantId }, data: { tenantId: null } });
  // Drop the acting cookie if it points at the tenant being deleted.
  if ((await cookies()).get(ACTING_TENANT_COOKIE)?.value === tenantId) {
    (await cookies()).delete(ACTING_TENANT_COOKIE);
  }
  await prisma.tenant.delete({ where: { id: tenantId } });
  revalidatePath("/platform");
  return { ok: true };
}

/** Platform-owner (super-admin) tenant + user management. Stage 1: create tenants,
 *  assign existing logins to a tenant as its admin, promote/demote super admins.
 *  Creating the login itself is self-serve (/sign-up), then assigned here. */

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  adminCount: number;
  assessmentCount: number;
  submissionCount: number;
  createdAt: string;
}

export async function listTenants(): Promise<ActionResult<TenantRow[]>> {
  await requireSuperAdmin();
  const rows = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: { where: { deletedAt: null } }, assessments: true, submissions: true } } },
  });
  return {
    ok: true,
    data: rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      adminCount: t._count.users,
      assessmentCount: t._count.assessments,
      submissionCount: t._count.submissions,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/**
 * Create a tenant AND its admin login in one step — mirroring signup (name, email,
 * password all required). The admin can log in immediately. Bypasses the signup
 * auto-provision hook (we assign the intended tenant directly), so no stray tenant.
 * Slug is derived from the name unless provided.
 */
export async function createTenant(
  name: string,
  email: string,
  password: string,
  slug?: string,
): Promise<ActionResult<{ id: string }>> {
  if (isStaff(await requireSuperAdmin())) return OWNER_ONLY;
  const nm = name.trim();
  if (nm.length < 2) return { ok: false, error: "Name is required." };
  const em = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { ok: false, error: "Enter a valid admin email." };
  const pw = (password ?? "").trim();
  if (pw.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const rawSlug = slug && slug.trim()
    ? slug.trim().toLowerCase()
    : nm.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const s = slugSchema.safeParse(rawSlug);
  if (!s.success) return { ok: false, error: s.error.issues[0]?.message ?? "Invalid slug." };
  if (await prisma.tenant.findUnique({ where: { slug: s.data }, select: { id: true } })) {
    return { ok: false, error: "That tenant slug is already in use." };
  }
  if (await prisma.user.findUnique({ where: { email: em }, select: { id: true } })) {
    return { ok: false, error: "A login with that email already exists." };
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(pw);
  const t = await prisma.tenant.create({ data: { slug: s.data, name: nm } });
  const u = await prisma.user.create({
    data: { name: nm, email: em, role: Role.ADMIN, tenantId: t.id, emailVerified: true },
  });
  await prisma.account.create({ data: { accountId: u.id, providerId: "credential", password: hashed, userId: u.id } });
  revalidatePath("/platform");
  return { ok: true, data: { id: t.id } };
}

export interface PlatformUserRow {
  id: string;
  name: string;
  email: string;
  tenantId: string | null;
  tenantName: string | null;
  /** Effective super admin: DB role SUPER_ADMIN OR the platform owner (always). */
  isSuper: boolean;
  /** The permanent platform owner — can never be demoted, assigned, or deleted. */
  isOwner: boolean;
}

function toUserRow(u: { id: string; name: string; email: string; tenantId: string | null; role: string; tenant: { name: string } | null }): PlatformUserRow {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    tenantId: u.tenantId,
    tenantName: u.tenant?.name ?? null,
    isSuper: u.role === "SUPER_ADMIN" || isPlatformOwner(u.email),
    isOwner: isPlatformOwner(u.email),
  };
}

export async function listUsers(): Promise<ActionResult<PlatformUserRow[]>> {
  await requireSuperAdmin();
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { tenant: { select: { name: true } } },
  });
  return { ok: true, data: users.map(toUserRow) };
}

/** Soft-deleted users (recoverable). Shown in the platform "Deleted users" section. */
export async function listDeletedUsers(): Promise<ActionResult<PlatformUserRow[]>> {
  await requireSuperAdmin();
  const users = await prisma.user.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: { tenant: { select: { name: true } } },
  });
  return { ok: true, data: users.map(toUserRow) };
}

/** Assign a login to a tenant as its ADMIN (or unassign with tenantId=null). */
export async function assignUserToTenant(userId: string, tenantId: string | null): Promise<ActionResult> {
  if (isStaff(await requireSuperAdmin())) return OWNER_ONLY;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return { ok: false, error: "User not found." };
  if (isPlatformOwner(target.email)) return { ok: false, error: "The platform owner isn't a tenant admin." };
  if (tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!t) return { ok: false, error: "Tenant not found." };
  }
  await prisma.user.update({ where: { id: userId }, data: { tenantId, role: Role.ADMIN } });
  revalidatePath("/platform");
  return { ok: true };
}

/** Promote/demote a login to platform super-admin. The owner is always super admin. */
export async function setUserSuperAdmin(userId: string, superAdmin: boolean): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) return OWNER_ONLY;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return { ok: false, error: "User not found." };
  if (isPlatformOwner(target.email)) return { ok: false, error: "The platform owner is always super admin." };
  if (userId === me.id && !superAdmin) return { ok: false, error: "You can't remove your own super-admin access." };
  await prisma.user.update({
    where: { id: userId },
    data: { role: superAdmin ? Role.SUPER_ADMIN : Role.ADMIN, ...(superAdmin ? { tenantId: null } : {}) },
  });
  revalidatePath("/platform");
  return { ok: true };
}

/** Soft-delete a login: hide it from active logins, unassign its tenant, and revoke
 *  its sessions immediately. Recoverable from the "Deleted users" section. The
 *  platform owner and the acting super admin can't be deleted. */
export async function deleteUser(userId: string): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) return OWNER_ONLY;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return { ok: false, error: "User not found." };
  if (userId === me.id) return { ok: false, error: "You can't delete your own account." };
  if (isPlatformOwner(target.email)) return { ok: false, error: "The platform owner can't be deleted." };
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date(), tenantId: null } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  revalidatePath("/platform");
  return { ok: true };
}

/** Restore a soft-deleted login (leaves it unassigned — reassign a tenant after). */
export async function restoreUser(userId: string): Promise<ActionResult> {
  if (isStaff(await requireSuperAdmin())) return OWNER_ONLY;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
  if (!target) return { ok: false, error: "User not found." };
  await prisma.user.update({ where: { id: userId }, data: { deletedAt: null } });
  revalidatePath("/platform");
  return { ok: true };
}

/** Super admin sets a user's password directly. Forces a change on next login and
 *  revokes current sessions so the new password takes effect immediately. */
export async function setUserPassword(userId: string, newPassword: string): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) return OWNER_ONLY;
  if ((newPassword ?? "").length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!target) return { ok: false, error: "User not found." };
  if (isPlatformOwner(target.email)) return { ok: false, error: "Use Forgot password for the owner account, not a set." };

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(newPassword.trim());
  const acct = await prisma.account.findFirst({ where: { userId, providerId: "credential" }, select: { id: true } });
  if (acct) {
    await prisma.account.update({ where: { id: acct.id }, data: { password: hashed } });
  } else {
    await prisma.account.create({ data: { accountId: userId, providerId: "credential", password: hashed, userId } });
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { mustChangePassword: true } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  revalidatePath("/platform");
  return { ok: true };
}
