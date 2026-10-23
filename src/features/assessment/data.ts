import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { statsFloorFor } from "@/lib/stats-floor";
import { ALL_TENANTS, whereScope, type Scope } from "@/lib/tenant/scope";
import { istDateRangeToUtc } from "@/lib/date";

/** Query helpers for admin pages and the public flow. UI-agnostic. */

/**
 * List assessments in a data scope: one workspace, or every tenant.
 *
 * 🔴 This used to take `tenantId: string | null` and pin it literally, so an owner
 * with no workspace entered matched only rows owned by NOBODY. That is fine while the
 * owner's own funnel lives in the null scope, and becomes the bug the moment it moves
 * to a real tenant: the list goes empty, and with it the assessment picker on Stats,
 * Submissions and Data window. A Scope says which of the two is meant.
 */
export async function listAssessments(scope: Scope = ALL_TENANTS) {
  return prisma.assessment.findMany({
    where: whereScope(scope),
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { categories: true, submissions: true } },
    },
  });
}

/** Resolve an assessment for the `?assessment=<id>` analytics filter, within a data
 *  scope. Returns null if it doesn't exist or isn't in scope - so a bad or foreign id
 *  silently falls back to the unscoped view instead of leaking another tenant's row. */
export async function getAssessmentForAnalytics(assessmentId: string, scope: Scope = ALL_TENANTS) {
  return prisma.assessment.findFirst({
    where: { id: assessmentId, ...whereScope(scope) },
    // resultPagePublished is selected only to know IF a native VSL page is live (so the
    // Submissions Result-URL cell can also offer its native link) - not its contents.
    select: { id: true, title: true, slug: true, statsResetAt: true, resultPagePublished: true },
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
      // The two result pages this funnel is bound to. Their DRAFT content lives on the
      // doc in the library, so the builder step needs the binding, not the blocks.
      resultsDoc: { select: { id: true, title: true, slug: true, published: true, publishedAt: true } },
      vslDoc: { select: { id: true, title: true, slug: true, published: true, publishedAt: true } },
      _count: { select: { submissions: true } },
    },
  });
}

/**
 * Public: only PUBLISHED assessments are reachable at /a/[slug].
 *
 * An assessment whose tenant has been soft-deleted is NOT reachable either, even when
 * published. Deleting a tenant has to stop its funnel - otherwise ad traffic keeps
 * landing and leads keep accruing to a business the owner thinks is gone, and nobody is
 * watching the inbox.
 *
 * The OR is what keeps an unowned assessment working: `tenantId: null` is a row from
 * before the re-home, which has no tenant to be deleted, and a relation filter alone
 * would exclude it and take the live funnel down.
 */
/**
 * Cache tag for one funnel's public data. Tagged PER SLUG so publishing one assessment
 * never flushes another's cache - with a single shared tag, one edit would cost every
 * live funnel a cold read at once, which is worst exactly when traffic is highest.
 */
export function publicAssessmentTag(slug: string): string {
  return `public-assessment:${slug}`;
}

/**
 * Drop the cached copy of a funnel. Call after any change the public page renders.
 *
 * Paired with the TTL below rather than relied on alone: many things can change what a
 * funnel shows - the assessment row, its questions, options, routes, bands, pages, the
 * result page - and a cache whose correctness depends on every one of those remembering
 * to call this would eventually serve a funnel that is wrong forever. With the TTL, a
 * missed call costs a minute of staleness instead of permanent wrongness.
 */
export function invalidatePublicAssessment(slug: string): void {
  revalidateTag(publicAssessmentTag(slug));
}

/**
 * Same flush, given an assessment id instead of a slug.
 *
 * The cache is keyed by slug (what the public URL uses) while the editing actions all
 * hold an id, so the slug is looked up. One cheap query on a save path, which is rare,
 * to keep the funnel read cached on every visit, which is not.
 *
 * Never throws: a cache flush failing must not fail the save that triggered it. Worst
 * case the TTL clears it a minute later. For a DELETE, call this BEFORE removing the
 * row - afterwards there is no slug left to look up.
 */
export async function invalidatePublicAssessmentById(id: string): Promise<void> {
  const a = await prisma.assessment
    .findUnique({ where: { id }, select: { slug: true } })
    .catch(() => null);
  if (a?.slug) invalidatePublicAssessment(a.slug);
}

/** How long a cached funnel may be stale: short enough that a missed invalidation is a
 *  minor delay, long enough to absorb a spike on one ad. */
const PUBLIC_ASSESSMENT_TTL_SECONDS = 60;

/** The uncached read, so the cached wrapper has something to call. */
async function readPublishedAssessmentBySlug(slug: string) {
  return prisma.assessment.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      OR: [{ tenantId: null }, { tenant: { deletedAt: null } }],
    },
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
      // auto-selected here), NOT the editable draft rows - so unpublished page edits
      // never go live.
    },
  });
}

/**
 * The funnel's data, cached.
 *
 * WHY THIS ONE: every visit to /a/<slug> loaded the assessment with its categories,
 * questions, options, routes and bands - a deep multi-join - for data that changes when
 * someone publishes, not per request. Under ad traffic that was the same query thousands
 * of times for an identical answer, each one holding a database connection while it ran.
 * The connection pool is the first wall this product hits, so removing the largest
 * repeat read is the single biggest lever available on concurrency.
 *
 * THE PAGE STAYS DYNAMIC, deliberately. Only this read is cached: the request still
 * needs its own headers and cookies for the pixel, the visitor id and the page-view row,
 * and caching the whole render would break all three. Cache the expensive part that is
 * identical for everyone; keep the per-visitor part per-visitor.
 *
 * `fresh` SKIPS THE CACHE ENTIRELY, and the preview link passes it. A tenant who has
 * just saved something and opens their own funnel to look at it is the one visitor who
 * must never be served a remembered copy: a cache that is briefly behind is invisible
 * under ad traffic and indistinguishable from "the feature does not work" when the
 * person watching is the person who just configured it. One uncached read per preview
 * is nothing; one tenant concluding the product ignores their settings is not.
 */
/**
 * The funnel as its OWNER previews it: the live row WHATEVER its status.
 *
 * 🔴 WHY THIS EXISTS. The builder offers a Preview link on a draft - that is the whole
 * point of a preview, since nobody wants to publish a funnel to find out what it looks
 * like - and the link 404ed, because the only read the public page had hard-filtered
 * `status: "PUBLISHED"` and `?preview=1` merely bypassed the cache. The publish screen
 * then advertised the same link as "Test it yourself", which worked only after the thing
 * it was meant to de-risk had already happened.
 *
 * Never cached and never called on the public path: the caller authorises the viewer
 * first (same tenant, or a super admin) and a visitor without that 404s exactly as
 * before. A draft is unpublished work, so who may look at it is the whole question.
 */
export async function readAssessmentForOwnerPreview(slug: string) {
  return prisma.assessment.findFirst({
    where: { slug, OR: [{ tenantId: null }, { tenant: { deletedAt: null } }] },
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
    },
  });
}

export async function getPublishedAssessmentBySlug(slug: string, opts?: { fresh?: boolean }) {
  if (opts?.fresh) return readPublishedAssessmentBySlug(slug);
  return unstable_cache(
    () => readPublishedAssessmentBySlug(slug),
    ["public-assessment", slug],
    { tags: [publicAssessmentTag(slug)], revalidate: PUBLIC_ASSESSMENT_TTL_SECONDS },
  )();
}

/** Resolve an assessment id to its slug + published flag (any status), for the
 *  audience gate's onward routing. The option is shown regardless of status (the
 *  builder flags drafts); a draft target simply won't be publicly reachable until
 *  it's published, but the option no longer silently disappears. Null = no such id. */
export async function getSlugById(
  id: string,
): Promise<{ slug: string; published: boolean } | null> {
  const a = await prisma.assessment.findUnique({
    where: { id },
    select: { slug: true, status: true },
  });
  return a ? { slug: a.slug, published: a.status === "PUBLISHED" } : null;
}

export async function listSubmissions(
  take = 100,
  scope: Scope = ALL_TENANTS,
  opts?: { assessmentId?: string | null; floor?: Date | null; from?: string; to?: string },
) {
  // Each scope uses its OWN reporting window; an assessment-scoped view passes its own
  // floor instead, so the global window is not applied on top of it.
  const floor = opts && "floor" in opts ? opts.floor ?? null : await statsFloorFor(scope);
  // Optional user-picked date range (IST). Combine with the floor: the lower bound
  // is the LATER of the two (both constraints apply). `to` is optional (open-ended).
  const { gte: rangeGte, lte: rangeLte } = istDateRangeToUtc(opts?.from, opts?.to);
  const lowerBounds = [floor, rangeGte].filter((d): d is Date => d instanceof Date);
  const gte = lowerBounds.length
    ? new Date(Math.max(...lowerBounds.map((d) => d.getTime())))
    : null;
  const createdAt =
    gte || rangeLte ? { ...(gte ? { gte } : {}), ...(rangeLte ? { lte: rangeLte } : {}) } : undefined;
  return prisma.submission.findMany({
    where: {
      ...(createdAt ? { createdAt } : {}),
      ...whereScope(scope),
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

export async function getDashboardCounts(scope: Scope = ALL_TENANTS) {
  // Each view uses its OWN reporting window (the tenant's, or the platform's when
  // counting across every tenant).
  const floor = await statsFloorFor(scope);
  const tenant = whereScope(scope);
  const completedWhere = {
    status: "COMPLETED" as const,
    ...tenant,
    ...(floor ? { createdAt: { gte: floor } } : {}),
  };
  const [assessments, published, submissions] = await Promise.all([
    prisma.assessment.count({ where: tenant }),
    prisma.assessment.count({ where: { ...tenant, status: "PUBLISHED" } }),
    prisma.submission.count({ where: completedWhere }),
  ]);
  return { assessments, published, submissions };
}


/**
 * SPLIT lead capture: the people who gave an email at the gate.
 *
 * WHY THIS IS NOT THE SUBMISSIONS LIST. In split mode the contact details arrive
 * before the assessment is answered, so for the next fifteen minutes there is a real
 * person with a real email and no submission. Those rows live on GateEntry, and this
 * is the read for them. Keeping them out of Submissions is what stops one person being
 * counted twice in the lead numbers the ad spend is judged on: qualified means gave an
 * email, Submissions means registered, and `submissionId` joins the two.
 *
 * 🔴 `emailCapturedAt: not null` is the whole filter. A GateEntry row with no email is
 * somebody who passed the gate and left - that is the Qualified count on Stats, not a
 * lead, and listing them here would turn an abandonment into a contact.
 */
export async function listGateQualified(
  take = 500,
  scope: Scope = ALL_TENANTS,
  opts?: { assessmentId?: string | null; floor?: Date | null; from?: string; to?: string },
) {
  const floor = opts && "floor" in opts ? opts.floor ?? null : await statsFloorFor(scope);
  const { gte: rangeGte, lte: rangeLte } = istDateRangeToUtc(opts?.from, opts?.to);
  const lowerBounds = [floor, rangeGte].filter((d): d is Date => d instanceof Date);
  const gte = lowerBounds.length
    ? new Date(Math.max(...lowerBounds.map((d) => d.getTime())))
    : null;
  const emailCapturedAt =
    gte || rangeLte
      ? { not: null, ...(gte ? { gte } : {}), ...(rangeLte ? { lte: rangeLte } : {}) }
      : { not: null };
  return prisma.gateEntry.findMany({
    where: {
      emailCapturedAt,
      ...whereScope(scope),
      ...(opts?.assessmentId ? { assessmentId: opts.assessmentId } : {}),
    },
    orderBy: { emailCapturedAt: "desc" },
    take,
    select: {
      id: true,
      customerId: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadProfession: true,
      audienceRole: true,
      emailCapturedAt: true,
      gateScore: true,
      gateMax: true,
      gateBand: true,
      gateBreakdown: true,
      qualificationAnswers: true,
      optinAnswers: true,
      submissionId: true,
      attribution: true,
      country: true,
      city: true,
      assessment: { select: { title: true, slug: true, optinFields: true } },
    },
  });
}

/**
 * Which of these leads went on to register, and what happened to them.
 *
 * A second query rather than a relation: GateEntry carries `submissionId` as a scalar
 * with no foreign key, matching how it already carries tenantId. That is deliberate -
 * the row has to survive its assessment being edited underneath it - but it means the
 * join is made here instead of by Prisma.
 */
export async function submissionsForGateLeads(ids: string[]) {
  if (ids.length === 0) return new Map<string, { status: string; completedAt: Date | null; totalScore: number | null; maxScore: number | null; bandTitle: string | null }>();
  const rows = await prisma.submission.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      status: true,
      completedAt: true,
      totalScore: true,
      maxScore: true,
      resultBand: { select: { title: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      {
        status: r.status as string,
        completedAt: r.completedAt,
        totalScore: r.totalScore,
        maxScore: r.maxScore,
        bandTitle: r.resultBand?.title ?? null,
      },
    ]),
  );
}
