"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { tenantAppSettingId } from "@/lib/settings/tenant-row";

/**
 * Per-tenant booking/calendar link. Read + written on the tenant's own AppSetting
 * row (never the platform singleton). The respondent results page renders a
 * "Book a 1-on-1 call" CTA pointing here; blank = the CTA is hidden.
 */
export async function getBookingUrl(): Promise<string> {
  const { tenantId } = await requireWorkspace();
  const s = await prisma.appSetting.findUnique({
    where: { tenantId },
    select: { bookingUrl: true },
  });
  return s?.bookingUrl ?? "";
}

export async function updateBookingUrl(url: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const trimmed = url.trim();
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: "Enter a full URL starting with http:// or https://" };
  }
  const data = { bookingUrl: trimmed || null };
  await prisma.appSetting.upsert({ where: { tenantId }, update: data, create: { id: tenantAppSettingId(tenantId), tenantId, ...data } });
  revalidatePath("/w/settings");
  return { ok: true };
}
