import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { invalidatePublicAssessmentById } from "@/features/assessment/data";
import { slugifyDocTitle, type DocKind } from "@/features/result-pages/docs";

/**
 * The one place the library touches live traffic.
 *
 * The public render path did not move: the funnel still reads Assessment.publishedPages
 * and the token page still reads Assessment.resultPagePublished. A doc's Publish writes
 * its own snapshot and then MIRRORS it onto the bound assessment, which is the only
 * coupling between the library and anything a respondent can see.
 *
 * Why keep it that way rather than have the public follow the link: every public read
 * site, the CTA resolver, the submissions list, the funnel cache and the QA harness
 * already read those columns correctly. Mirroring is two writes; re-pointing them all
 * would be a sweep of live code for no behavioural gain.
 *
 * A free doc mirrors nowhere, which is exactly what "not in use" should mean.
 */

/** Push a doc's published snapshot onto whichever assessment it is bound to. */
export async function mirrorPublished(docId: string): Promise<void> {
  const doc = await prisma.resultPageDoc.findUnique({
    where: { id: docId },
    select: {
      kind: true,
      published: true,
      publishedAt: true,
      resultsOf: { select: { id: true } },
      vslOf: { select: { id: true } },
    },
  });
  if (!doc) return;
  const assessmentId = doc.resultsOf?.id ?? doc.vslOf?.id ?? null;
  if (!assessmentId) return;

  const snapshot = (doc.published ?? null) as Prisma.InputJsonValue | null;
  if (doc.kind === "RESULTS") {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        publishedPages: snapshot ?? Prisma.DbNull,
        pagesPublishedAt: doc.publishedAt ?? null,
      },
    });
    // The public funnel renders the snapshot from a cached copy of the assessment.
    await invalidatePublicAssessmentById(assessmentId);
  } else {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        resultPagePublished: snapshot ?? Prisma.DbNull,
        resultPagePublishedAt: doc.publishedAt ?? null,
      },
    });
  }
}

/**
 * Take a kind's live snapshot off an assessment.
 *
 * Used when a page is unbound: the funnel no longer has that page, so it must stop
 * serving the last thing it was given. Leaving the snapshot behind would be a page
 * that is live and editable from nowhere, which is the exact state this whole feature
 * exists to remove.
 */
export async function clearMirror(assessmentId: string, kind: DocKind): Promise<void> {
  if (kind === "RESULTS") {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { publishedPages: Prisma.DbNull, pagesPublishedAt: null },
    });
    await invalidatePublicAssessmentById(assessmentId);
  } else {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { resultPagePublished: Prisma.DbNull, resultPagePublishedAt: null },
    });
  }
}

/** A slug free within this workspace: "<base>", then "<base>-2", "<base>-3", … */
export async function uniqueDocSlug(tenantId: string | null, base: string): Promise<string> {
  const root = slugifyDocTitle(base);
  let candidate = root;
  for (let n = 2; n < 500; n++) {
    const taken = await prisma.resultPageDoc.findFirst({
      where: { tenantId, slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now()}`;
}
