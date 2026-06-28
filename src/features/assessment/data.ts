import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getStatsFloor } from "@/lib/stats-floor";

/** Query helpers for admin pages and the public flow. UI-agnostic. */

export async function listAssessments() {
  return prisma.assessment.findMany({
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
      pages: { orderBy: { order: "asc" }, include: { blocks: { orderBy: { order: "asc" } } } },
    },
  });
}

export async function listSubmissions(take = 100) {
  const floor = await getStatsFloor();
  return prisma.submission.findMany({
    where: floor ? { createdAt: { gte: floor } } : {},
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

export async function getDashboardCounts() {
  const floor = await getStatsFloor();
  const completedWhere = floor
    ? { status: "COMPLETED" as const, createdAt: { gte: floor } }
    : { status: "COMPLETED" as const };
  const [assessments, published, submissions] = await Promise.all([
    prisma.assessment.count(),
    prisma.assessment.count({ where: { status: "PUBLISHED" } }),
    prisma.submission.count({ where: completedWhere }),
  ]);
  return { assessments, published, submissions };
}
