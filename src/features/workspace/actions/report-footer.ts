"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { resolvePlan } from "@/lib/billing/plan-resolve";
import { canSetReportFooter } from "@/lib/pdf/footer";
import { tenantAppSettingId } from "@/lib/settings/tenant-row";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The tenant's own PDF footer. Only plans above Gate have one: Gate prints the Assess360
 * watermark. See lib/pdf/footer.ts. Checked here as well as hidden in the form, because a
 * server action is callable directly.
 */
export async function getReportFooter(): Promise<{ footer: string; canEdit: boolean }> {
  const { tenantId } = await requireWorkspace();
  const [s, rated] = await Promise.all([
    prisma.appSetting.findUnique({ where: { tenantId }, select: { reportFooter: true } }),
    resolvePlan(tenantId),
  ]);
  return { footer: s?.reportFooter ?? "", canEdit: canSetReportFooter(rated) };
}

const footerSchema = z.string().trim().max(400, "Keep the footer under 400 characters.");

export async function updateReportFooter(footer: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  if (!canSetReportFooter(await resolvePlan(tenantId))) {
    return { ok: false, error: "The PDF footer can be changed on Signal and above." };
  }
  const parsed = footerSchema.safeParse(footer);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid footer." };

  const data = { reportFooter: parsed.data || null };
  await prisma.appSetting.upsert({ where: { tenantId }, update: data, create: { id: tenantAppSettingId(tenantId), tenantId, ...data } });
  revalidatePath("/w/settings");
  return { ok: true };
}
