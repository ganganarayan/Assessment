"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Move a done-for-you request along the pipeline.
 *
 * Super-admin only, and not per-tenant: an applicant is not a tenant and most never will
 * be, so there is no workspace this could belong to. The statuses are plain strings
 * rather than an enum, because this pipeline will be renamed while the offer is being
 * run and a renamed enum value costs a migration.
 */
const ALLOWED = new Set(["NEW", "CONTACTED", "BUILT", "DECLINED"]);

export async function setDfyRequestStatus(id: string, status: string): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  if (!ALLOWED.has(status)) return { ok: false, error: "Unknown status." };

  await prisma.dfyRequest.update({ where: { id }, data: { status } });
  revalidatePath("/admin/build-requests");
  return { ok: true };
}
