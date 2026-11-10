"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, configTenantOf, scopeEditDenied } from "@/lib/tenant/acting";
import { appSettingWhere, tenantAppSettingId } from "@/lib/settings/tenant-row";
import { isValidTimeZone, zoneOr } from "@/lib/region/zone";
import { isPaymentCurrency, currencyOr } from "@/lib/region/money";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Region (Phase 4, selling outside India): the timezone this workspace's respondents
 * see (booking slots, booking page, reminders) and the currency they pay in. Admin
 * screens stay IST whatever is chosen. Acting-scoped, so one card serves /w/settings,
 * /admin/settings while impersonating, and the platform's own row.
 */
export async function getRegion(): Promise<{ timeZone: string; currency: string }> {
  const scope = await resolveActingScope();
  const row = await prisma.appSetting.findUnique({
    where: appSettingWhere(configTenantOf(scope)),
    select: { timeZone: true, paymentCurrency: true },
  });
  return { timeZone: zoneOr(row?.timeZone), currency: currencyOr(row?.paymentCurrency) };
}

export async function updateRegion(input: { timeZone: string; currency: string }): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const tenantId = configTenantOf(scope);

  const timeZone = input.timeZone.trim();
  if (!isValidTimeZone(timeZone)) return { ok: false, error: "Pick a timezone from the list, or type a valid one like Europe/London." };
  const currency = input.currency.trim().toUpperCase();
  if (!isPaymentCurrency(currency)) return { ok: false, error: "Pick a currency from the list." };

  const data = { timeZone, paymentCurrency: currency };
  await prisma.appSetting.upsert({
    where: appSettingWhere(tenantId),
    update: data,
    create: { id: tenantAppSettingId(tenantId), tenantId, ...data },
  });
  revalidatePath("/w/settings");
  revalidatePath("/admin/settings");
  return { ok: true };
}
