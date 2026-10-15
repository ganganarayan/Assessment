import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope } from "@/lib/tenant/acting";
import { readResultPage, type ResultPageData } from "@/features/assessment/result-page/blocks";
import { readPublishedPages, type AssessmentPageData } from "@/features/assessment/pages/blocks";
import { readExits } from "@/features/assessment/schemas";
import { PLATFORM_TENANT_ID } from "@/lib/tenant/platform-tenant";
import {
  SHELF_FALLBACK_CATEGORY,
  type DocKind,
  type DocRow,
  type ShelfRow,
} from "@/features/result-pages/docs";

/**
 * Reads for the result-page library.
 *
 * Every query is scoped with tenantScope(), which resolves to the acting workspace -
 * or to the Platform tenant for a super admin who has not entered one. A doc is just
 * another tenant-owned row, so the rule that keeps assessments from leaking keeps
 * pages from leaking, through the same choke point.
 */

/** The doc + its binding, or null when it is out of the caller's scope. */
export async function getScopedDoc(id: string) {
  const scope = await resolveActingScope();
  return prisma.resultPageDoc.findFirst({
    where: { id, ...tenantScope(scope) },
    select: {
      id: true,
      kind: true,
      title: true,
      slug: true,
      draft: true,
      published: true,
      publishedAt: true,
      sourceSlug: true,
      tenantId: true,
      resultsOf: { select: { id: true, title: true, slug: true, disqualifiedContent: true } },
      vslOf: { select: { id: true, title: true, slug: true, disqualifiedContent: true } },
    },
  });
}

export async function docInScope(id: string): Promise<boolean> {
  const scope = await resolveActingScope();
  const found = await prisma.resultPageDoc.findFirst({ where: { id, ...tenantScope(scope) }, select: { id: true } });
  return !!found;
}

/** The assessment a doc is bound to (either kind), or null when it is free. */
export function boundAssessmentOf(doc: {
  resultsOf: { id: string; title: string } | null;
  vslOf: { id: string; title: string } | null;
}): { id: string; title: string } | null {
  return doc.resultsOf ?? doc.vslOf ?? null;
}

/** The library list, newest first within each kind. */
export async function listDocs(kind?: DocKind): Promise<DocRow[]> {
  const scope = await resolveActingScope();
  const rows = await prisma.resultPageDoc.findMany({
    where: { ...tenantScope(scope), ...(kind ? { kind } : {}) },
    orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      kind: true,
      title: true,
      slug: true,
      draft: true,
      published: true,
      publishedAt: true,
      sourceSlug: true,
      updatedAt: true,
      tenantId: true,
      shelfListed: true,
      shelfCategory: true,
      shelfSummary: true,
      resultsOf: { select: { id: true, title: true } },
      vslOf: { select: { id: true, title: true } },
      _count: { select: { pages: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    slug: r.slug,
    // "How much is in here": draft blocks for a VSL page, draft pages for a results
    // page. Two different units, but the question the list answers is the same one.
    size: r.kind === "VSL" ? readResultPage(r.draft ?? null).blocks.length : r._count.pages,
    published: r.published != null,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
    boundTo: boundAssessmentOf(r),
    sourceSlug: r.sourceSlug,
    platformOwned: isPlatformOwned(r.tenantId),
    shelfListed: r.shelfListed,
    shelfCategory: r.shelfCategory,
    shelfSummary: r.shelfSummary,
  }));
}

/**
 * The docs of one kind that are bound to nothing, for the builder's picker.
 *
 * A page already in use is deliberately absent rather than shown and refused: the
 * binding is 1:1, so the honest list is the one you can actually choose from, with
 * Clone as the way to get a used page onto a second funnel.
 */
export async function listFreeDocs(kind: DocKind): Promise<{ id: string; title: string; slug: string; published: boolean }[]> {
  const scope = await resolveActingScope();
  const rows = await prisma.resultPageDoc.findMany({
    where: { ...tenantScope(scope), kind, resultsOf: { is: null }, vslOf: { is: null } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, slug: true, published: true },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, published: r.published != null }));
}

/** The doc bound to an assessment for one kind, as the builder step needs it. */
export async function boundDocFor(
  assessmentId: string,
  kind: DocKind,
): Promise<{ id: string; title: string; slug: string; published: boolean; publishedAt: string | null } | null> {
  const a = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      resultsDoc: { select: { id: true, title: true, slug: true, published: true, publishedAt: true } },
      vslDoc: { select: { id: true, title: true, slug: true, published: true, publishedAt: true } },
    },
  });
  const d = kind === "RESULTS" ? a?.resultsDoc : a?.vslDoc;
  if (!d) return null;
  return {
    id: d.id,
    title: d.title,
    slug: d.slug,
    published: d.published != null,
    publishedAt: d.publishedAt ? d.publishedAt.toISOString() : null,
  };
}

/** The VSL draft to open in the editor. */
export function vslDraftOf(doc: { draft: unknown }): ResultPageData {
  return readResultPage(doc.draft ?? null);
}

/** The RESULTS draft rows, ordered, shaped for the builder. */
export async function resultsDraftOf(docId: string): Promise<AssessmentPageData[]> {
  const pages = await prisma.assessmentPage.findMany({
    where: { docId },
    orderBy: { order: "asc" },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
  return pages.map((p) => ({
    id: p.id,
    order: p.order,
    title: p.title,
    blocks: p.blocks.map((b) => ({
      id: b.id,
      type: b.type as AssessmentPageData["blocks"][number]["type"],
      order: b.order,
      config: (b.config ?? {}) as Record<string, unknown>,
    })),
  }));
}

/** The published RESULTS snapshot held on the doc (not the assessment's mirror). */
export function resultsPublishedOf(doc: { published: unknown }): AssessmentPageData[] {
  return readPublishedPages(doc.published ?? null);
}

/**
 * Editor context that only the BOUND assessment can supply: the owner's band words
 * (so the band-sentence editor shows their vocabulary) and whether the funnel has an
 * exit route that carries people on (so the VSL editor offers "who is this block
 * for"). A free page has neither, and both degrade to "not available yet" rather than
 * blocking the edit.
 */
export async function editorContextFor(assessmentId: string | null): Promise<{
  bandTitles: Record<string, string>;
  hasExitRoutes: boolean;
}> {
  if (!assessmentId) return { bandTitles: {}, hasExitRoutes: false };
  const a = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { disqualifiedContent: true, resultBands: { select: { level: true, title: true } } },
  });
  return {
    bandTitles: Object.fromEntries((a?.resultBands ?? []).map((b) => [b.level, b.title])),
    hasExitRoutes: readExits(a?.disqualifiedContent ?? null).some((e) => e.mode === "CONTINUE"),
  };
}

/**
 * Whose rows may go on the shelf.
 *
 * The Platform tenant, plus the legacy `null` owner that pre-dates owner stamping -
 * a page backfilled from an unowned assessment is the platform's in every sense except
 * the column, and the re-home sweep will stamp it eventually.
 */
export function isPlatformOwned(tenantId: string | null): boolean {
  return tenantId === null || tenantId === PLATFORM_TENANT_ID;
}

/** Prisma filter for "the platform's own library". */
const platformWhere = { OR: [{ tenantId: PLATFORM_TENANT_ID }, { tenantId: null }] };

/**
 * The shelf, as a workspace sees it.
 *
 * Deliberately NOT scoped to the acting tenant: this is the one cross-workspace read in
 * the feature, and it is narrowed to exactly the rows the owner chose to publish. A
 * bound page is excluded whatever its flag says - a template is a starting point, and a
 * page serving a live funnel is not one.
 *
 * `includeUnlisted` is for the owner reviewing their own shelf, nobody else.
 */
export async function listShelfDocs(opts: { includeUnlisted?: boolean; kind?: DocKind } = {}): Promise<ShelfRow[]> {
  const rows = await prisma.resultPageDoc.findMany({
    where: {
      ...platformWhere,
      ...(opts.includeUnlisted ? {} : { shelfListed: true }),
      ...(opts.kind ? { kind: opts.kind } : {}),
      resultsOf: { is: null },
      vslOf: { is: null },
    },
    orderBy: [{ kind: "asc" }, { shelfCategory: "asc" }, { shelfOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      kind: true,
      title: true,
      slug: true,
      draft: true,
      shelfListed: true,
      shelfCategory: true,
      shelfSummary: true,
      shelfOrder: true,
      _count: { select: { pages: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    slug: r.slug,
    summary: r.shelfSummary,
    category: r.shelfCategory || SHELF_FALLBACK_CATEGORY,
    size: r.kind === "VSL" ? readResultPage(r.draft ?? null).blocks.length : r._count.pages,
    listed: r.shelfListed,
    order: r.shelfOrder,
  }));
}

/**
 * One shelf page, for importing.
 *
 * The gate is the row's own state, not the caller's scope: it must be platform-owned,
 * listed, and bound to nothing. `allowUnlisted` is passed only for the owner, whose
 * job is to read a page before putting it on the shelf.
 */
export async function shelfDocForImport(id: string, allowUnlisted: boolean) {
  return prisma.resultPageDoc.findFirst({
    where: {
      id,
      ...platformWhere,
      ...(allowUnlisted ? {} : { shelfListed: true }),
      resultsOf: { is: null },
      vslOf: { is: null },
    },
    select: {
      id: true,
      kind: true,
      title: true,
      slug: true,
      draft: true,
      published: true,
      pages: { orderBy: { order: "asc" }, include: { blocks: { orderBy: { order: "asc" } } } },
    },
  });
}
