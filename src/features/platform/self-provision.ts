"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser, isSuperAdmin } from "@/lib/auth/guards";
import { generateId } from "@/lib/ids";
import { type ActionResult } from "@/features/assessment/actions/shared";

function slugFrom(seed: string): string {
  const s = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return s || "tenant";
}

/**
 * Self-serve provisioning for a tenant-less login (e.g. accounts created before the
 * signup auto-provision hook existed). Creates their own tenant and makes them its
 * admin. Idempotent; super admins are steered to the platform console instead.
 */
export async function provisionMyWorkspace(): Promise<ActionResult> {
  const user = await requireUser();
  if (isSuperAdmin(user)) {
    return { ok: false, error: "Super admins manage tenants from the platform console." };
  }
  // Read the live record (the session copy of tenantId can be stale after login).
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { tenantId: true } });
  if (fresh?.tenantId) return { ok: true };

  const seed = user.name || user.email.split("@")[0] || "tenant";
  let slug = slugFrom(seed);
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) break;
    slug = `${slugFrom(seed)}-${generateId(4).toLowerCase()}`;
  }
  const tenant = await prisma.tenant.create({ data: { name: user.name || user.email, slug } });
  await prisma.user.update({ where: { id: user.id }, data: { tenantId: tenant.id, role: Role.ADMIN } });
  revalidatePath("/dashboard");
  return { ok: true };
}
