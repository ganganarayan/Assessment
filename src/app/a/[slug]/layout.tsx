import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { tenantBrand } from "@/lib/tenant/brand";
import { tenantThemeCss } from "@/lib/tenant/theme-css";
import { TenantLegalFooter } from "@/components/tenant-legal-footer";
import { resolveMetaConfig, resolveHeatmapCode } from "@/lib/settings/config";
import { tenantCan } from "@/lib/billing/entitlements";
import { MetaPixel } from "@/components/meta-pixel";
import { HeatmapRecording } from "@/components/heatmap-recording";

/**
 * Per-assessment funnel layout: loads THIS assessment's tenant and mounts its Meta
 * Pixel (env fallback for the platform/Gita tenant), so each tenant's funnel fires
 * its OWN pixel. Covers the landing (/a/[slug]) and result (/a/[slug]/r/...) pages.
 */
const ownerOf = (slug: string) =>
  prisma.assessment.findFirst({
    where: { slug },
    // adAccountId: which pixel THIS funnel renders. Null = the tenant's default, which
    // is what every assessment carried before the picker existed.
    select: { tenantId: true, heatmapCode: true, adAccountId: true },
  });

/**
 * The funnel OWNER's tab icon (Phase 3, white label). The root layout picks the icon by
 * HOST, so a tenant's funnel opened on the platform address showed the Assess360 icon.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const brand = await tenantBrand((await ownerOf(slug))?.tenantId ?? null);
  const icon = brand.faviconUrl;
  return icon ? { icons: { icon, shortcut: icon, apple: icon } } : {};
}

export default async function AssessmentSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = await ownerOf(slug);
  const tenantId = a?.tenantId ?? null;
  const [{ pixelId }, tenantHeatmap, canHeatmap, brand] = await Promise.all([
    // 🔴 The browser pixel and the server-side events must resolve the SAME account, or
    // one funnel reports its page views to one dataset and its conversions to another -
    // which looks like a tracking bug nobody can locate.
    resolveMetaConfig(tenantId, a?.adAccountId ?? null),
    resolveHeatmapCode(tenantId),
    // Billing gate: heatmap / session recording is a Growth+ capability. Platform/Gita
    // scope (tenantId null) is unlimited and always allowed.
    tenantCan(tenantId, "heatmap"),
    tenantBrand(tenantId),
  ]);
  // 🔴 The funnel wears its OWNER's colours on every host. The root layout colours by
  // host, so a tenant with no live domain (served on the platform address) showed the
  // platform palette. Emitted after the root's style, so it wins.
  const themeCss = brand.isPlatform ? null : tenantThemeCss(brand.primaryColor, brand.secondaryColor);
  // This assessment's own recording snippet wins; else fall back to the tenant default.
  // Suppressed entirely when the tenant's plan doesn't include heatmap recording.
  const heatmapCode = canHeatmap ? (a?.heatmapCode?.trim() || tenantHeatmap) : null;
  return (
    <>
      {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      <MetaPixel pixelId={pixelId} />
      <HeatmapRecording code={heatmapCode} />
      {children}
      {/* The OWNER's privacy and terms, under the funnel and its result page. */}
      {a ? <TenantLegalFooter tenantId={tenantId} /> : null}
    </>
  );
}
