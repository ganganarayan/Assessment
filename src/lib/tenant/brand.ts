import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";

/**
 * Whose name, logo and colours a RESPONDENT sees (Phase 3 of the multi-tenant review).
 *
 * 🔴 WHY ONE PLACE. "Assess360" was written into the respondent's side of a tenant's
 * funnel in several separate spots: the Razorpay checkout on the tenant's OWN account,
 * the PDF report title and file name, the favicon on the tenant's domain, the colours
 * on any host the tenant had not connected. A buyer paying "Assess360" on a statement
 * they expected to say the tenant's name is a chargeback. Every one of those surfaces now
 * asks this, and the answer for a business tenant is the business.
 *
 * The platform (and legacy null-tenant rows) is Assess360, with no logo override: its
 * own icon and colours are the defaults the app already ships.
 *
 * Request-deduped with React cache, so a page that asks five times costs one query.
 */
export const PLATFORM_BRAND_NAME = "Assess360";

export interface TenantBrand {
  /** Shown as the business name: checkout, PDF title, page titles. */
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  /** Social share card for the tenant's pages, when a funnel has no cover image. */
  shareImageUrl: string | null;
  /** Hex colours, only when the tenant has set a Theme row; null means app defaults. */
  primaryColor: string | null;
  secondaryColor: string | null;
  isPlatform: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const cleanUrl = (u: string | null | undefined): string | null => {
  const v = (u ?? "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null;
};

export const PLATFORM_BRAND: TenantBrand = {
  name: PLATFORM_BRAND_NAME,
  logoUrl: null,
  faviconUrl: null,
  shareImageUrl: null,
  primaryColor: null,
  secondaryColor: null,
  isPlatform: true,
};

export const tenantBrand = cache(async (tenantId: string | null | undefined): Promise<TenantBrand> => {
  if (!isBusinessTenant(tenantId)) return PLATFORM_BRAND;
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      theme: { select: { primaryColor: true, secondaryColor: true, logoUrl: true, faviconUrl: true, shareImageUrl: true } },
    },
  });
  if (!t) return PLATFORM_BRAND;
  return {
    name: t.name.trim() || PLATFORM_BRAND_NAME,
    logoUrl: cleanUrl(t.theme?.logoUrl),
    faviconUrl: cleanUrl(t.theme?.faviconUrl),
    shareImageUrl: cleanUrl(t.theme?.shareImageUrl),
    primaryColor: t.theme && HEX.test(t.theme.primaryColor) ? t.theme.primaryColor : null,
    secondaryColor: t.theme && HEX.test(t.theme.secondaryColor) ? t.theme.secondaryColor : null,
    isPlatform: false,
  };
});
