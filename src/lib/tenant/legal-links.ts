import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { platformOrigin } from "@/lib/tenant/public-origin";

export interface LegalLinks {
  privacyUrl: string | null;
  termsUrl: string | null;
}

const httpsOnly = (u: string | null | undefined): string | null => {
  const v = (u ?? "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null;
};

/**
 * Whose privacy and terms a respondent is shown (Phase 3, white label).
 *
 * A business tenant's OWN links from Settings, Brand and legal, or none at all: never
 * the platform's policy, which names Assess360's company as the data controller of
 * someone else's leads. The platform's own funnels link its own /privacy and /terms.
 */
export const legalLinksFor = cache(async (tenantId: string | null | undefined): Promise<LegalLinks> => {
  if (!isBusinessTenant(tenantId)) {
    const o = platformOrigin();
    return { privacyUrl: `${o}/privacy`, termsUrl: `${o}/terms` };
  }
  const row = await prisma.appSetting
    .findUnique({ where: appSettingWhere(tenantId), select: { privacyUrl: true, termsUrl: true } })
    .catch(() => null);
  return { privacyUrl: httpsOnly(row?.privacyUrl), termsUrl: httpsOnly(row?.termsUrl) };
});
