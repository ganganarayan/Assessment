import { prisma } from "@/lib/db/prisma";
import { resolveMetaConfig, resolveHeatmapCode } from "@/lib/settings/config";
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
  const a = await prisma.assessment.findFirst({ where: { slug }, select: { tenantId: true, heatmapCode: true } });
  const tenantId = a?.tenantId ?? null;
  const [{ pixelId }, tenantHeatmap] = await Promise.all([
    resolveMetaConfig(tenantId),
    resolveHeatmapCode(tenantId),
  ]);
  // This assessment's own recording snippet wins; else fall back to the tenant default.
  const heatmapCode = a?.heatmapCode?.trim() || tenantHeatmap;
  return (
    <>
      <MetaPixel pixelId={pixelId} />
      <HeatmapRecording code={heatmapCode} />
      {children}
    </>
  );
}
