"use server";

import { revalidatePath } from "next/cache";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser, isSuperAdmin, type AuthUser } from "@/lib/auth/guards";
import { isPlatformOwner } from "@/lib/auth/platform";
import { generateId } from "@/lib/ids";
import { type ActionResult } from "@/features/assessment/actions/shared";

function slugFrom(seed: string): string {
  const s = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return s || "tenant";
}

/**
 * Create a fresh tenant for a login that has none, and return it. Shared by the
 * self-serve provision path and the deleted-account return path so both mint a
 * workspace identically (unique slug, same 14-day trial as a signup). It only
 * creates the tenant; the caller decides what to write back onto the user (tenant
 * link, role, and - for a returning account - clearing deletedAt).
 */
async function createTenantForUser(user: AuthUser) {
  const seed = user.name || user.email.split("@")[0] || "tenant";
  let slug = slugFrom(seed);
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) break;
    slug = `${slugFrom(seed)}-${generateId(4).toLowerCase()}`;
  }
  // Without the trial end the workspace resolves as PARKED the moment it is created.
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  return prisma.tenant.create({ data: { name: user.name || user.email, slug, trialEndsAt } });
}

/**
 * Self-serve provisioning for a tenant-less login (e.g. accounts created before the
 * signup auto-provision hook existed). Creates their own tenant and makes them its
 * admin. Idempotent; super admins are steered to the platform console instead.
 */
export async function provisionMyWorkspace(): Promise<ActionResult> {
  const user = await requireUser();
  // The platform owner is never a tenant - guard by email too, in case the DB
  // role has drifted (a demoted owner must not be re-tenanted here).
  if (isSuperAdmin(user) || isPlatformOwner(user.email)) {
    return { ok: false, error: "Super admins manage tenants from the platform console." };
  }
  // Read the live record (the session copy of tenantId can be stale after login).
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true, deletedAt: true },
  });
  if (fresh?.tenantId) return { ok: true };
  // A removed account must never silently re-provision from this everyday path - it
  // returns through the explicit welcome-back screen (reactivateMyWorkspace), which is
  // the one place that clears deletedAt. Belt and suspenders: the dashboard already
  // diverts a deleted login away from the provision button before it is ever shown.
  if (fresh?.deletedAt) {
    return { ok: false, error: "This account was removed. Reactivate it from the welcome-back screen." };
  }

  const tenant = await createTenantForUser(user);
  await prisma.user.update({ where: { id: user.id }, data: { tenantId: tenant.id, role: Role.ADMIN } });
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Bring a soft-deleted login back and give it a fresh, empty workspace. Driven by the
 * "Create a new workspace" button on /welcome-back. Clears deletedAt and provisions in
 * the same update, so the account is reactivated only together with its new tenant.
 *
 * This is the SELF-SERVE return: a clean start, not the old data. The super-admin
 * "Restore" in the platform console is the other path - it brings the account back so
 * its original tenant can be reassigned with everything intact.
 */
export async function reactivateMyWorkspace(): Promise<ActionResult> {
  const user = await requireUser();
  // Super admins / the platform owner are never tenants, so they are never reactivated
  // into one. (A deleted super admin is an owner-only edge that the console handles.)
  if (isSuperAdmin(user) || isPlatformOwner(user.email)) {
    return { ok: false, error: "Super admins are managed from the platform console." };
  }
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true, deletedAt: true },
  });
  // Not actually a returning deleted account: if they already have a workspace there is
  // nothing to do, and if they are simply tenant-less they use the ordinary provision.
  if (!fresh?.deletedAt) {
    if (fresh?.tenantId) return { ok: true };
    return provisionMyWorkspace();
  }

  const tenant = await createTenantForUser(user);
  await prisma.user.update({
    where: { id: user.id },
    data: { tenantId: tenant.id, role: Role.ADMIN, deletedAt: null },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}
