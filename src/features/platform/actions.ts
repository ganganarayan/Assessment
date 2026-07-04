"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { slugSchema } from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";

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
    include: { _count: { select: { users: true, assessments: true, submissions: true } } },
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

export async function createTenant(name: string, slug: string): Promise<ActionResult<{ id: string }>> {
  await requireSuperAdmin();
  const s = slugSchema.safeParse(slug.trim().toLowerCase());
  if (!s.success) return { ok: false, error: s.error.issues[0]?.message ?? "Invalid slug." };
  const nm = name.trim();
  if (nm.length < 2) return { ok: false, error: "Tenant name is required." };
  const existing = await prisma.tenant.findUnique({ where: { slug: s.data } });
  if (existing) return { ok: false, error: "That tenant slug is already in use." };
  const t = await prisma.tenant.create({ data: { slug: s.data, name: nm } });
  revalidatePath("/platform");
  return { ok: true, data: { id: t.id } };
}

export interface PlatformUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  tenantName: string | null;
}

export async function listUsers(): Promise<ActionResult<PlatformUserRow[]>> {
  await requireSuperAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { tenant: { select: { name: true } } },
  });
  return {
    ok: true,
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      tenantId: u.tenantId,
      tenantName: u.tenant?.name ?? null,
    })),
  };
}

/** Assign a login to a tenant as its ADMIN (or unassign with tenantId=null). */
export async function assignUserToTenant(userId: string, tenantId: string | null): Promise<ActionResult> {
  await requireSuperAdmin();
  if (tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!t) return { ok: false, error: "Tenant not found." };
  }
  await prisma.user.update({ where: { id: userId }, data: { tenantId, role: Role.ADMIN } });
  revalidatePath("/platform");
  return { ok: true };
}

/** Promote/demote a login to platform super-admin (manage the whole platform). */
export async function setUserSuperAdmin(userId: string, superAdmin: boolean): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (userId === me.id && !superAdmin) return { ok: false, error: "You can't remove your own super-admin access." };
  await prisma.user.update({
    where: { id: userId },
    data: { role: superAdmin ? Role.SUPER_ADMIN : Role.ADMIN, ...(superAdmin ? { tenantId: null } : {}) },
  });
  revalidatePath("/platform");
  return { ok: true };
}
