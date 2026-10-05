import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Which assessment a tenant's own root (its subdomain or a custom domain) serves.
 *
 * Resolution, in order:
 *   1. the tenant's chosen primary, if it is still published and still theirs
 *   2. otherwise, its only published assessment
 *   3. otherwise null - the root keeps the generic page
 *
 * Rule 3 is the important one. With several published assessments and no choice made,
 * ANY pick is a guess, and guessing wrong on a domain someone is running ads to is
 * worse than showing nothing: the traffic lands on a real funnel that is simply the
 * wrong one, so it converts, reports fine, and nobody notices for weeks. "Most recent"
 * would be the usual shortcut here and is exactly that failure - it also silently
 * changes the live landing page every time an assessment is edited.
 *
 * The primary is verified against THIS tenant, so a stale id left over from a moved or
 * deleted assessment cannot serve another tenant's funnel on this domain.
 */
export async function rootAssessmentSlugFor(
  tenantId: string,
  primaryAssessmentId: string | null,
): Promise<string | null> {
  if (primaryAssessmentId) {
    const chosen = await prisma.assessment.findFirst({
      where: { id: primaryAssessmentId, tenantId, status: "PUBLISHED" },
      select: { slug: true },
    });
    if (chosen) return chosen.slug;
    // Chosen but unusable (unpublished, moved, deleted) - fall through rather than
    // 404, so the root degrades to the single-assessment rule instead of breaking.
  }

  // `take: 2` answers "is there exactly one?" without counting the whole table.
  const published = await prisma.assessment.findMany({
    where: { tenantId, status: "PUBLISHED" },
    select: { slug: true },
    take: 2,
  });
  return published.length === 1 ? published[0]!.slug : null;
}
