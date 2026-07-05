import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getStatsFloor } from "@/lib/stats-floor";

/** Query helpers for admin pages and the public flow. UI-agnostic. */

/** List assessments for a scope. tenantId null = platform/Gita (null-tenant rows);
 *  a tenant id = that workspace. Always filters — never returns cross-tenant rows. */
export async function listAssessments(tenantId: string | null) {
  return prisma.assessment.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { categories: true, submissions: true } },
    },
  });
}

export async function getAssessmentById(id: string) {
  return prisma.assessment.findUnique({
    where: { id },
    include: {
      categories: {
        orderBy: { displayOrder: "asc" },
        include: {
          questions: {
            orderBy: { displayOrder: "asc" },
            include: { options: { orderBy: { displayOrder: "asc" } } },
          },
          bands: { orderBy: { displayOrder: "asc" } },
        },
      },
      resultBands: { orderBy: { displayOrder: "asc" } },
      pages: { orderBy: { order: "asc" }, include: { blocks: { orderBy: { order: "asc" } } } },
      _count: { select: { submissions: true } },
    },
  });
}

/** Public: only PUBLISHED assessments are reachable at /a/[slug]. */
export async function getPublishedAssessmentBySlug(slug: string) {
  return prisma.assessment.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      categories: {
        orderBy: { displayOrder: "asc" },
        include: {
          questions: {
            orderBy: { displayOrder: "asc" },
            include: { options: { orderBy: { displayOrder: "asc" } } },
          },
        },
      },
      resultBands: { orderBy: { displayOrder: "asc" } },
      // NOTE: the public renders Assessment.publishedPages (a scalar JSON snapshot,
      // auto-selected here), NOT the editable draft rows — so unpublished page edits
      // never go live.
    },
  });
}

export async function listSubmissions(take = 100, tenantId: string | null = null) {
  // The stats-floor "reset to 0" baseline is the platform/Gita setting — apply it
  // only to the platform view, never to a tenant's own submissions.
  const floor = tenantId ? null : await getStatsFloor();
  return prisma.submission.findMany({
    where: {
      ...(floor ? { createdAt: { gte: floor } } : {}),
      tenantId,
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      assessment: { select: { title: true, slug: true } },
      resultBand: { select: { level: true, title: true } },
    },
  });
}

export async function getSubmissionResult(submissionId: string) {
  return prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assessment: { select: { id: true, slug: true, title: true, thankYouMessage: true } },
      resultBand: true,
      categoryScores: { include: { category: { select: { name: true } } } },
    },
  });
}

export async function getDashboardCounts(tenantId: string | null = null) {
  // The stats-floor "reset to 0" is a platform/Gita setting — never apply it to a tenant.
  const floor = tenantId ? null : await getStatsFloor();
  const completedWhere = {
    status: "COMPLETED" as const,
    tenantId,
    ...(floor ? { createdAt: { gte: floor } } : {}),
  };
  const [assessments, published, submissions] = await Promise.all([
    prisma.assessment.count({ where: { tenantId } }),
    prisma.assessment.count({ where: { tenantId, status: "PUBLISHED" } }),
    prisma.submission.count({ where: completedWhere }),
  ]);
  return { assessments, published, submissions };
}
