import { prisma } from "@/lib/db/prisma";
import { resolveMetaConfig } from "@/lib/settings/config";
import { MetaPixel } from "@/components/meta-pixel";

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
  const a = await prisma.assessment.findFirst({ where: { slug }, select: { tenantId: true } });
  const { pixelId } = await resolveMetaConfig(a?.tenantId ?? null);
  return (
    <>
      <MetaPixel pixelId={pixelId} />
      {children}
    </>
  );
}
