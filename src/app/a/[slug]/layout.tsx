import { prisma } from "@/lib/db/prisma";
import { resolveMetaConfig, resolveHeatmapCode } from "@/lib/settings/config";
import { tenantCan } from "@/lib/billing/entitlements";
import { MetaPixel } from "@/components/meta-pixel";
import { HeatmapRecording } from "@/components/heatmap-recording";

/**
 * Per-assessment funnel layout: loads THIS assessment's tenant and mounts its Meta
 * Pixel (env fallback for the platform/Gita tenant), so each tenant's funnel fires
 * its OWN pixel. Covers the landing (/a/[slug]) and result (/a/[slug]/r/...) pages.
 */
export default async function AssessmentSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = await prisma.assessment.findFirst({
    where: { slug },
    // adAccountId: which pixel THIS funnel renders. Null = the tenant's default, which
    // is what every assessment carried before the picker existed.
    select: { tenantId: true, heatmapCode: true, adAccountId: true },
  });
  const tenantId = a?.tenantId ?? null;
  const [{ pixelId }, tenantHeatmap, canHeatmap] = await Promise.all([
    // 🔴 The browser pixel and the server-side events must resolve the SAME account, or
    // one funnel reports its page views to one dataset and its conversions to another -
    // which looks like a tracking bug nobody can locate.
    resolveMetaConfig(tenantId, a?.adAccountId ?? null),
    resolveHeatmapCode(tenantId),
    // Billing gate: heatmap / session recording is a Growth+ capability. Platform/Gita
    // scope (tenantId null) is unlimited and always allowed.
    tenantCan(tenantId, "heatmap"),
  ]);
  // This assessment's own recording snippet wins; else fall back to the tenant default.
  // Suppressed entirely when the tenant's plan doesn't include heatmap recording.
  const heatmapCode = canHeatmap ? (a?.heatmapCode?.trim() || tenantHeatmap) : null;
  return (
    <>
      <MetaPixel pixelId={pixelId} />
      <HeatmapRecording code={heatmapCode} />
      {children}
    </>
  );
}
