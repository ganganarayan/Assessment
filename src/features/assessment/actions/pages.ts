"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertEdit } from "@/lib/tenant/acting";
import { isBlockType, defaultConfig, readPublishedPages, type AssessmentPageData } from "@/features/assessment/pages/blocks";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { resolveVidapulseParam } from "@/lib/vidapulse";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { docInScope, resultsDraftOf } from "@/features/result-pages/data";
import { mirrorPublished } from "@/features/result-pages/mirror";

/**
 * The RESULTS page builder, scoped to a ResultPageDoc.
 *
 * These actions used to take an assessmentId, because the draft rows hung off the
 * assessment. The rows now hang off a doc, so the unit of editing is the doc - which
 * is what lets the same page be cloned, named and bound to a different funnel, and
 * what lets a page exist in the library while bound to nothing at all.
 *
 * Publish writes the doc's snapshot and mirrors it onto the bound assessment, which is
 * still the only thing the public renders.
 */

/** Result data the public page-2 needs for dynamic blocks. Bands only - the real
 *  numeric scores are NEVER sent (the teaser blurs them; the VSL shows them after
 *  payment via the token), so a viewer can't read scores from the response. */
export interface PageResultData {
  overallBandTitle: string | null;
  overallBandLevel: string | null;
  categories: { name: string; band: string | null }[];
  // VidaPulse identity bridge: the opaque customerId + the tenant's effective param
  // name, so the VSL video block can carry the id into the embed. param null = off.
  customerId: string | null;
  vidapulseParam: string | null;
}

export async function getResultForPages(submissionId: string): Promise<ActionResult<PageResultData>> {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { resultSnapshot: true, customerId: true, assessment: { select: { tenantId: true } } },
  });
  const snap = (s?.resultSnapshot ?? null) as ResultSnapshot | null;
  if (!snap) return { ok: false, error: "No result yet." };
  // Resolve the tenant's VidaPulse param (singleton for platform/Gita assessments).
  const tenantId = s?.assessment.tenantId ?? null;
  const setting = await prisma.appSetting.findUnique({
    where: appSettingWhere(tenantId) as never,
    select: { vidapulseTrackingEnabled: true, vidapulseParam: true },
  });
  return {
    ok: true,
    data: {
      overallBandTitle: snap.resultBand ?? null,
      overallBandLevel: snap.resultBandLevel ?? null,
      categories: (Array.isArray(snap.categories) ? snap.categories : []).map((c) => ({ name: c.name, band: c.band })),
      customerId: s?.customerId ?? null,
      vidapulseParam: resolveVidapulseParam(setting),
    },
  };
}

/** Load a doc's pages + blocks, ordered, shaped for the builder + renderer. */
export async function loadPages(docId: string): Promise<AssessmentPageData[]> {
  return resultsDraftOf(docId);
}

/** Publish: snapshot the doc's draft rows onto the doc, then mirror it onto the bound
 *  assessment - the only thing the public renders. Draft edits stay invisible until
 *  this, and a doc bound to nothing publishes to the library and nowhere else. */
export async function publishPages(docId: string): Promise<ActionResult<{ publishedAt: string }>> {
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const draft = await loadPages(docId);
  const now = new Date();
  await prisma.resultPageDoc.update({
    where: { id: docId },
    data: { published: draft as unknown as Prisma.InputJsonValue, publishedAt: now },
  });
  await mirrorPublished(docId);
  return { ok: true, data: { publishedAt: now.toISOString() } };
}

/** Unpublish: clear the live snapshot so the public flow shows NO results page and
 *  falls through to the destination (VSL) redirect. Draft rows are kept untouched,
 *  so Publish later restores the page. */
export async function unpublishPages(docId: string): Promise<ActionResult> {
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.resultPageDoc.update({
    where: { id: docId },
    data: { published: Prisma.DbNull, publishedAt: null },
  });
  await mirrorPublished(docId);
  return { ok: true };
}

/**
 * The published snapshot the PUBLIC renders, read from the assessment's own column.
 *
 * Deliberately still the assessment and not the doc: the mirror is what makes the
 * funnel's live page independent of anything happening in the library, including a doc
 * being unbound or deleted mid-session.
 */
export async function getPublishedPages(assessmentId: string): Promise<AssessmentPageData[]> {
  const a = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { publishedPages: true } });
  return readPublishedPages(a?.publishedPages ?? null);
}

async function docIdForPage(pageId: string): Promise<string | null> {
  const p = await prisma.assessmentPage.findUnique({ where: { id: pageId }, select: { docId: true } });
  return p?.docId ?? null;
}
async function docIdForBlock(blockId: string): Promise<string | null> {
  const b = await prisma.pageBlock.findUnique({ where: { id: blockId }, select: { page: { select: { docId: true } } } });
  return b?.page.docId ?? null;
}

export async function listPages(docId: string): Promise<ActionResult<AssessmentPageData[]>> {
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  return { ok: true, data: await loadPages(docId) };
}

export async function addPage(docId: string): Promise<ActionResult<AssessmentPageData[]>> {
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const max = await prisma.assessmentPage.aggregate({ where: { docId }, _max: { order: true } });
  await prisma.assessmentPage.create({
    data: { docId, order: (max._max.order ?? -1) + 1, title: "Results page" },
  });
  return { ok: true, data: await loadPages(docId) };
}

export async function updatePageTitle(pageId: string, title: string): Promise<ActionResult<AssessmentPageData[]>> {
  const docId = await docIdForPage(pageId);
  if (!docId) return { ok: false, error: "Page not found." };
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.assessmentPage.update({ where: { id: pageId }, data: { title: title.trim() || null } });
  return { ok: true, data: await loadPages(docId) };
}

export async function deletePage(pageId: string): Promise<ActionResult<AssessmentPageData[]>> {
  const docId = await docIdForPage(pageId);
  if (!docId) return { ok: false, error: "Page not found." };
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.assessmentPage.delete({ where: { id: pageId } });
  return { ok: true, data: await loadPages(docId) };
}

/** Swap a page's order with its previous/next sibling. */
export async function movePage(pageId: string, dir: "up" | "down"): Promise<ActionResult<AssessmentPageData[]>> {
  const docId = await docIdForPage(pageId);
  if (!docId) return { ok: false, error: "Page not found." };
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const pages = await prisma.assessmentPage.findMany({ where: { docId }, orderBy: { order: "asc" }, select: { id: true, order: true } });
  const i = pages.findIndex((p) => p.id === pageId);
  const j = dir === "up" ? i - 1 : i + 1;
  const a = pages[i];
  const b = pages[j];
  if (a && b) {
    await prisma.$transaction([
      prisma.assessmentPage.update({ where: { id: a.id }, data: { order: b.order } }),
      prisma.assessmentPage.update({ where: { id: b.id }, data: { order: a.order } }),
    ]);
  }
  return { ok: true, data: await loadPages(docId) };
}

export async function addBlock(pageId: string, type: string): Promise<ActionResult<AssessmentPageData[]>> {
  if (!isBlockType(type)) return { ok: false, error: "Unknown block type." };
  const docId = await docIdForPage(pageId);
  if (!docId) return { ok: false, error: "Page not found." };
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const max = await prisma.pageBlock.aggregate({ where: { pageId }, _max: { order: true } });
  await prisma.pageBlock.create({
    data: { pageId, order: (max._max.order ?? -1) + 1, type, config: defaultConfig(type) as Prisma.InputJsonValue },
  });
  return { ok: true, data: await loadPages(docId) };
}

export async function updateBlockConfig(blockId: string, config: Record<string, unknown>): Promise<ActionResult<AssessmentPageData[]>> {
  const docId = await docIdForBlock(blockId);
  if (!docId) return { ok: false, error: "Block not found." };
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.pageBlock.update({ where: { id: blockId }, data: { config: (config ?? {}) as Prisma.InputJsonValue } });
  return { ok: true, data: await loadPages(docId) };
}

export async function deleteBlock(blockId: string): Promise<ActionResult<AssessmentPageData[]>> {
  const docId = await docIdForBlock(blockId);
  if (!docId) return { ok: false, error: "Block not found." };
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.pageBlock.delete({ where: { id: blockId } });
  return { ok: true, data: await loadPages(docId) };
}

export async function moveBlock(blockId: string, dir: "up" | "down"): Promise<ActionResult<AssessmentPageData[]>> {
  const block = await prisma.pageBlock.findUnique({ where: { id: blockId }, select: { pageId: true, page: { select: { docId: true } } } });
  if (!block) return { ok: false, error: "Block not found." };
  if (!(await docInScope(block.page.docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const blocks = await prisma.pageBlock.findMany({ where: { pageId: block.pageId }, orderBy: { order: "asc" }, select: { id: true, order: true } });
  const i = blocks.findIndex((b) => b.id === blockId);
  const j = dir === "up" ? i - 1 : i + 1;
  const a = blocks[i];
  const b = blocks[j];
  if (a && b) {
    await prisma.$transaction([
      prisma.pageBlock.update({ where: { id: a.id }, data: { order: b.order } }),
      prisma.pageBlock.update({ where: { id: b.id }, data: { order: a.order } }),
    ]);
  }
  return { ok: true, data: await loadPages(block.page.docId) };
}

