"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role, StaffPermission } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { requireOwnerAdmin, isSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Staff provisioning — OWNER/ADMIN ONLY (requireOwnerAdmin bounces staff). A super
 * admin manages platform staff + any tenant's staff; a tenant admin manages only
 * their own tenant's staff. Every mutation targets ONLY rows where staffPermission
 * is set, so an owner/admin can never be modified or deleted here.
 *
 * Staff accounts are created directly (User + credential Account) with Better Auth's
 * own password hasher, so the normal email+password sign-in verifies them — without
 * the signup hook's auto-tenant or any session change for the admin.
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  permission: z.enum(["VIEW", "EDIT"]),
  // Super-admin only: which tenant this staff belongs to. "" / null = PLATFORM staff.
  tenantId: z.string().optional().nullable(),
});
export type CreateStaffInput = z.infer<typeof createSchema>;

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  permission: string;
  tenantId: string | null;
  tenantName: string | null;
  scope: "platform" | "tenant";
  createdAt: string;
}

export interface TenantOption {
  id: string;
  name: string;
}

export interface StaffView {
  isSuper: boolean;
  staff: StaffRow[];
  /** Tenants a super admin can assign staff to (empty for a tenant admin). */
  tenants: TenantOption[];
}

async function scope() {
  const user = await requireOwnerAdmin();
  return { user, isSuper: isSuperAdmin(user), ownTenant: user.tenantId ?? null };
}

function revalidate() {
  revalidatePath("/admin/staff");
  revalidatePath("/w/staff");
}

export async function getStaff(): Promise<StaffView> {
  const { isSuper, ownTenant } = await scope();
  const where = isSuper
    ? { staffPermission: { not: null } }
    : { staffPermission: { not: null }, tenantId: ownTenant };
  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      staffPermission: true,
      tenantId: true,
      createdAt: true,
      tenant: { select: { name: true } },
    },
  });
  const tenants = isSuper
    ? await prisma.tenant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];
  return {
    isSuper,
    tenants,
    staff: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      permission: r.staffPermission ?? "VIEW",
      tenantId: r.tenantId,
      tenantName: r.tenant?.name ?? null,
      scope: r.tenantId ? "tenant" : "platform",
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function createStaff(input: CreateStaffInput): Promise<ActionResult> {
  const { isSuper, ownTenant } = await scope();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  // Resolve the staff's tenant + role from the caller's scope.
  let tenantId: string | null;
  let role: Role;
  if (isSuper) {
    tenantId = d.tenantId && d.tenantId.trim() ? d.tenantId.trim() : null; // null = platform staff
    role = tenantId ? Role.ADMIN : Role.SUPER_ADMIN;
    if (tenantId) {
      const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
      if (!t) return { ok: false, error: "That tenant does not exist." };
    }
  } else {
    if (!ownTenant) return { ok: false, error: "No workspace." };
    tenantId = ownTenant;
    role = Role.ADMIN;
  }

  const existing = await prisma.user.findUnique({ where: { email: d.email }, select: { id: true } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  // Hash with Better Auth's own hasher so email+password sign-in verifies it.
  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(d.password);

  const created = await prisma.user.create({
    data: {
      name: d.name,
      email: d.email,
      emailVerified: true,
      role,
      tenantId,
      staffPermission: d.permission as StaffPermission,
    },
    select: { id: true },
  });
  await prisma.account.create({
    data: { accountId: created.id, providerId: "credential", password: hashed, userId: created.id },
  });

  revalidate();
  return { ok: true };
}

export async function setStaffPermission(userId: string, permission: string): Promise<ActionResult> {
  const { isSuper, ownTenant } = await scope();
  if (permission !== "VIEW" && permission !== "EDIT") return { ok: false, error: "Invalid permission." };
  // Only a STAFF row can be targeted — an owner/admin (null permission) is never matched.
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { staffPermission: true, tenantId: true } });
  if (!target || !target.staffPermission) return { ok: false, error: "Staff member not found." };
  if (!isSuper && target.tenantId !== ownTenant) return { ok: false, error: "Not allowed." };
  await prisma.user.update({ where: { id: userId }, data: { staffPermission: permission as StaffPermission } });
  revalidate();
  return { ok: true };
}

export async function removeStaff(userId: string): Promise<ActionResult> {
  const { isSuper, ownTenant } = await scope();
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { staffPermission: true, tenantId: true } });
  if (!target || !target.staffPermission) return { ok: false, error: "Staff member not found." };
  if (!isSuper && target.tenantId !== ownTenant) return { ok: false, error: "Not allowed." };
  await prisma.user.delete({ where: { id: userId } }); // cascades sessions + accounts
  revalidate();
  return { ok: true };
}
