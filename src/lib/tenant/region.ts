import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { zoneOr } from "@/lib/region/zone";
import { currencyOr } from "@/lib/region/money";

/**
 * A tenant's region (Phase 4): the timezone its RESPONDENTS see and the currency they
 * pay in. Platform scope reads the singleton row. Defaults are Asia/Kolkata and INR,
 * which is what every tenant had before. Request-deduped; never throws.
 */
export const tenantRegion = cache(
  async (tenantId: string | null | undefined): Promise<{ timeZone: string; currency: string }> => {
    const row = await prisma.appSetting
      .findUnique({ where: appSettingWhere(tenantId), select: { timeZone: true, paymentCurrency: true } })
      .catch(() => null);
    return { timeZone: zoneOr(row?.timeZone), currency: currencyOr(row?.paymentCurrency) };
  },
);

export async function tenantTimeZone(tenantId: string | null | undefined): Promise<string> {
  return (await tenantRegion(tenantId)).timeZone;
}

export async function tenantCurrency(tenantId: string | null | undefined): Promise<string> {
  return (await tenantRegion(tenantId)).currency;
}
