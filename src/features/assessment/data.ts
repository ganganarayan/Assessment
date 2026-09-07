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

/** Resolve an assessment for the `?assessment=<id>` analytics filter, scoped to the
 *  acting tenant (null = platform/Gita). Returns null if it doesn't exist or isn't in
 *  scope — so a bad/foreign id silently falls back to the global view (no leak). */
export async function getAssessmentForAnalytics(assessmentId: string, tenantId: string | null) {
  return prisma.assessment.findFirst({
    where: { id: assessmentId, tenantId },
    select: { id: true, title: true, slug: true, statsResetAt: true },
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
            include: { options: { orderBy: { displayOrder: "asc" }, include: { route: true } } },
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
            include: { options: { orderBy: { displayOrder: "asc" }, include: { route: true } } },
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

/** Public: the slug of an assessment IF it is PUBLISHED (else null). Used to
 *  resolve the audience gate's "None of the above" onward assessment — a draft
 *  target is treated as no target (falls back to the URL / hides the option). */
export async function getPublishedSlugById(id: string): Promise<string | null> {
  const a = await prisma.assessment.findFirst({
    where: { id, status: "PUBLISHED" },
    select: { slug: true },
  });
  return a?.slug ?? null;
}

export async function listSubmissions(
  take = 100,
  tenantId: string | null = null,
  opts?: { assessmentId?: string | null; floor?: Date | null },
) {
  // The stats-floor "reset to 0" baseline is the platform/Gita setting — apply it
  // only to the platform view. An assessment-scoped view passes its own floor.
  const floor = opts && "floor" in opts ? opts.floor ?? null : await getStatsFloor(tenantId);
  return prisma.submission.findMany({
    where: {
      ...(floor ? { createdAt: { gte: floor } } : {}),
      tenantId,
      ...(opts?.assessmentId ? { assessmentId: opts.assessmentId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      assessment: { select: { title: true, slug: true, targetUrl: true, engine: true, nextStep: true, optinFields: true, preResultFields: true } },
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
  // Each view uses its OWN reporting window (tenant's, or the singleton for platform).
  const floor = await getStatsFloor(tenantId);
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
