"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { tenantAppSettingId } from "@/lib/settings/tenant-row";

/**
 * Per-tenant support email. Read + written on the tenant's own AppSetting row (never
 * the platform singleton). Shown to a RESPONDENT on the neutral "results unavailable —
 * contact support" screen when the workspace is over its response cap. Blank = the
 * screen renders without a mailto.
 */
export async function getSupportEmail(): Promise<string> {
  const { tenantId } = await requireWorkspace();
  const s = await prisma.appSetting.findUnique({
    where: { tenantId },
    select: { supportEmail: true },
  });
  return s?.supportEmail ?? "";
}

export async function updateSupportEmail(email: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const trimmed = email.trim();
  // Light validation — a single address with an @ and a dotted domain. Blank clears it.
  if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const data = { supportEmail: trimmed || null };
  await prisma.appSetting.upsert({
    where: { tenantId },
    update: data,
    create: { id: tenantAppSettingId(tenantId), tenantId, ...data },
  });
  revalidatePath("/w/settings");
  return { ok: true };
}
