"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit/log";
import { withCapLock } from "@/lib/db/cap-lock";
import { z } from "zod";
import { Role, StaffPermission } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { requireOwnerAdmin, isSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { assertCanAddSeat } from "@/lib/billing/gate";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PARKED_MESSAGE } from "@/lib/billing/plans";

/**
 * Staff provisioning - OWNER/ADMIN ONLY (requireOwnerAdmin bounces staff). A super
 * admin manages platform staff + any tenant's staff; a tenant admin manages only
 * their own tenant's staff. Every mutation targets ONLY rows where staffPermission
 * is set, so an owner/admin can never be modified or deleted here.
 *
 * Staff accounts are created directly (User + credential Account) with Better Auth's
 * own password hasher, so the normal email+password sign-in verifies them - without
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

/**
 * 🔴 A tenant admin manages THEIR tenant's staff, and "no tenant" is not a tenant. A
 * non-super login with a null tenant (a self-provision that failed half way) used to
 * match every row whose tenant is also null - which is where the PLATFORM's staff live -
 * so it could list, re-permission and delete the owner's own team. Such a caller now
 * owns nothing, and super-admin rows are never a tenant admin's to touch.
 */
function tenantAdminMayTouch(
  ownTenant: string | null,
  target: { tenantId: string | null; role: string },
): boolean {
  return ownTenant !== null && target.tenantId === ownTenant && target.role !== "SUPER_ADMIN";
}

export async function getStaff(): Promise<StaffView> {
  const { isSuper, ownTenant } = await scope();
  if (!isSuper && !ownTenant) return { isSuper, staff: [], tenants: [] };
  const where = isSuper
    ? { staffPermission: { not: null } }
    : { staffPermission: { not: null }, tenantId: ownTenant, role: "ADMIN" as const };
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
    // Active only - a deleted tenant must not be offered as somewhere to put a new
    // staff member, the same way it is not offered when assigning a login.
    ? await prisma.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
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

async function createStaffUnderCapLock(input: CreateStaffInput): Promise<ActionResult> {
  const { user, isSuper, ownTenant } = await scope();
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
      const t = await prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!t) return { ok: false, error: "That tenant does not exist." };
    }
  } else {
    if (!ownTenant) return { ok: false, error: "No workspace." };
    tenantId = ownTenant;
    role = Role.ADMIN;
  }

  const existing = await prisma.user.findUnique({ where: { email: d.email }, select: { id: true } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  /**
   * Seat cap. Published as "1 / 3 / 10 users" since launch, carried in PlanLimits, and
   * until now read by nothing but the usage meter - so the number on the pricing page
   * described nothing the product did.
   *
   * The owner is a seat, which is why Gate (one user) refuses every staff invite. That
   * is exactly what the plan says, and it would still read as a bug, so the message says
   * who the one seat belongs to instead of quoting a limit.
   *
   * Super admins are never capped - they are not rated against a plan - and platform
   * staff (no tenant) have no plan to be capped by.
   */
  if (!isSuper && tenantId) {
    const seat = await assertCanAddSeat(tenantId);
    if (!seat.ok) {
      if ((await resolvePlan(tenantId)).parked) return { ok: false, error: PARKED_MESSAGE };
      return {
        ok: false,
        error:
          seat.limit === 1
            ? "Your plan includes one user, which is your own login. Upgrade to add staff."
            : `Your plan includes ${seat.limit} users and all ${seat.used} are in use. Remove a staff member, or upgrade to add more.`,
      };
    }
  }

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
      // The admin typed this password, so it is a shared secret from the first second.
      // The staff member is made to replace it at their first sign-in, the same rule a
      // super admin's password set already follows (enforceAccountState).
      mustChangePassword: true,
    },
    select: { id: true },
  });
  await prisma.account.create({
    data: { accountId: created.id, providerId: "credential", password: hashed, userId: created.id },
  });
  await audit({
    actor: user,
    action: "staff.create",
    tenantId,
    targetType: "user",
    targetId: created.id,
    summary: `Added ${d.email} as ${d.permission} staff.`,
  });

  revalidate();
  return { ok: true };
}

export async function setStaffPermission(userId: string, permission: string): Promise<ActionResult> {
  const { user, isSuper, ownTenant } = await scope();
  if (permission !== "VIEW" && permission !== "EDIT") return { ok: false, error: "Invalid permission." };
  // Only a STAFF row can be targeted - an owner/admin (null permission) is never matched.
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { staffPermission: true, tenantId: true, role: true } });
  if (!target || !target.staffPermission) return { ok: false, error: "Staff member not found." };
  if (!isSuper && !tenantAdminMayTouch(ownTenant, target)) return { ok: false, error: "Not allowed." };
  await prisma.user.update({ where: { id: userId }, data: { staffPermission: permission as StaffPermission } });
  await audit({ actor: user, action: "staff.permission", tenantId: target.tenantId, targetType: "user", targetId: userId, summary: `Changed a staff member to ${permission}.` });
  revalidate();
  return { ok: true };
}

export async function removeStaff(userId: string): Promise<ActionResult> {
  const { user, isSuper, ownTenant } = await scope();
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { staffPermission: true, tenantId: true, role: true } });
  if (!target || !target.staffPermission) return { ok: false, error: "Staff member not found." };
  if (!isSuper && !tenantAdminMayTouch(ownTenant, target)) return { ok: false, error: "Not allowed." };
  await prisma.user.delete({ where: { id: userId } }); // cascades sessions + accounts
  await audit({ actor: user, action: "staff.remove", tenantId: target.tenantId, targetType: "user", targetId: userId, summary: "Removed a staff member." });
  revalidate();
  return { ok: true };
}

/**
 * createStaff, with the workspace's seats cap held for the whole action, so two at once cannot both
 * pass the count (lib/db/cap-lock.ts).
 */
export async function createStaff(input: CreateStaffInput): Promise<ActionResult> {
  return withCapLock("seats", () => createStaffUnderCapLock(input));
}
