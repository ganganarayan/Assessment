"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { assertEdit } from "@/lib/tenant/acting";
import { isBlockType, defaultConfig, readPublishedPages, type BlockType, type AssessmentPageData } from "@/features/assessment/pages/blocks";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { type ActionResult } from "@/features/assessment/actions/shared";

/** Result data the public page-2 needs for dynamic blocks. Bands only — the real
 *  numeric scores are NEVER sent (the teaser blurs them; the VSL shows them after
 *  payment via the token), so a viewer can't read scores from the response. */
export interface PageResultData {
  overallBandTitle: string | null;
  overallBandLevel: string | null;
  categories: { name: string; band: string | null }[];
}

export async function getResultForPages(submissionId: string): Promise<ActionResult<PageResultData>> {
  const s = await prisma.submission.findUnique({ where: { id: submissionId }, select: { resultSnapshot: true } });
  const snap = (s?.resultSnapshot ?? null) as ResultSnapshot | null;
  if (!snap) return { ok: false, error: "No result yet." };
  return {
    ok: true,
    data: {
      overallBandTitle: snap.resultBand ?? null,
      overallBandLevel: snap.resultBandLevel ?? null,
      categories: (Array.isArray(snap.categories) ? snap.categories : []).map((c) => ({ name: c.name, band: c.band })),
    },
  };
}

/** Load an assessment's pages + blocks, ordered, shaped for the builder + renderer. */
export async function loadPages(assessmentId: string): Promise<AssessmentPageData[]> {
  const pages = await prisma.assessmentPage.findMany({
    where: { assessmentId },
    orderBy: { order: "asc" },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
  return pages.map((p) => ({
    id: p.id,
    order: p.order,
    title: p.title,
    blocks: p.blocks.map((b) => ({
      id: b.id,
      type: b.type as BlockType,
      order: b.order,
      config: (b.config ?? {}) as Record<string, unknown>,
    })),
  }));
}

/** Publish: snapshot the current draft (rows) into Assessment.publishedPages — the
 *  only thing the public renders. Auto-saved draft edits stay invisible until this. */
export async function publishPages(assessmentId: string): Promise<ActionResult<{ publishedAt: string }>> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const draft = await loadPages(assessmentId);
  const now = new Date();
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { publishedPages: draft as unknown as Prisma.InputJsonValue, pagesPublishedAt: now },
  });
  return { ok: true, data: { publishedAt: now.toISOString() } };
}

/** Unpublish: clear the live snapshot so the public flow shows NO results page and
 *  falls through to the destination (VSL) redirect. Draft rows are kept untouched,
 *  so Publish later restores the page. */
export async function unpublishPages(assessmentId: string): Promise<ActionResult> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { publishedPages: Prisma.DbNull, pagesPublishedAt: null },
  });
  return { ok: true };
}

/** The published snapshot for the public flow (empty if never published). */
export async function getPublishedPages(assessmentId: string): Promise<AssessmentPageData[]> {
  const a = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { publishedPages: true } });
  return readPublishedPages(a?.publishedPages ?? null);
}

async function assessmentIdForPage(pageId: string): Promise<string | null> {
  const p = await prisma.assessmentPage.findUnique({ where: { id: pageId }, select: { assessmentId: true } });
  return p?.assessmentId ?? null;
}
async function assessmentIdForBlock(blockId: string): Promise<string | null> {
  const b = await prisma.pageBlock.findUnique({ where: { id: blockId }, select: { page: { select: { assessmentId: true } } } });
  return b?.page.assessmentId ?? null;
}

export async function listPages(assessmentId: string): Promise<ActionResult<AssessmentPageData[]>> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  return { ok: true, data: await loadPages(assessmentId) };
}

export async function addPage(assessmentId: string): Promise<ActionResult<AssessmentPageData[]>> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const max = await prisma.assessmentPage.aggregate({ where: { assessmentId }, _max: { order: true } });
  await prisma.assessmentPage.create({
    data: { assessmentId, order: (max._max.order ?? -1) + 1, title: "Results page" },
  });
  return { ok: true, data: await loadPages(assessmentId) };
}

export async function updatePageTitle(pageId: string, title: string): Promise<ActionResult<AssessmentPageData[]>> {
  const assessmentId = await assessmentIdForPage(pageId);
  if (!assessmentId) return { ok: false, error: "Page not found." };
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.assessmentPage.update({ where: { id: pageId }, data: { title: title.trim() || null } });
  return { ok: true, data: await loadPages(assessmentId) };
}

export async function deletePage(pageId: string): Promise<ActionResult<AssessmentPageData[]>> {
  const assessmentId = await assessmentIdForPage(pageId);
  if (!assessmentId) return { ok: false, error: "Page not found." };
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.assessmentPage.delete({ where: { id: pageId } });
  return { ok: true, data: await loadPages(assessmentId) };
}

/** Swap a page's order with its previous/next sibling. */
export async function movePage(pageId: string, dir: "up" | "down"): Promise<ActionResult<AssessmentPageData[]>> {
  const assessmentId = await assessmentIdForPage(pageId);
  if (!assessmentId) return { ok: false, error: "Page not found." };
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const pages = await prisma.assessmentPage.findMany({ where: { assessmentId }, orderBy: { order: "asc" }, select: { id: true, order: true } });
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
  return { ok: true, data: await loadPages(assessmentId) };
}

export async function addBlock(pageId: string, type: string): Promise<ActionResult<AssessmentPageData[]>> {
  if (!isBlockType(type)) return { ok: false, error: "Unknown block type." };
  const assessmentId = await assessmentIdForPage(pageId);
  if (!assessmentId) return { ok: false, error: "Page not found." };
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const max = await prisma.pageBlock.aggregate({ where: { pageId }, _max: { order: true } });
  await prisma.pageBlock.create({
    data: { pageId, order: (max._max.order ?? -1) + 1, type, config: defaultConfig(type) as Prisma.InputJsonValue },
  });
  return { ok: true, data: await loadPages(assessmentId) };
}

export async function updateBlockConfig(blockId: string, config: Record<string, unknown>): Promise<ActionResult<AssessmentPageData[]>> {
  const assessmentId = await assessmentIdForBlock(blockId);
  if (!assessmentId) return { ok: false, error: "Block not found." };
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.pageBlock.update({ where: { id: blockId }, data: { config: (config ?? {}) as Prisma.InputJsonValue } });
  return { ok: true, data: await loadPages(assessmentId) };
}

export async function deleteBlock(blockId: string): Promise<ActionResult<AssessmentPageData[]>> {
  const assessmentId = await assessmentIdForBlock(blockId);
  if (!assessmentId) return { ok: false, error: "Block not found." };
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.pageBlock.delete({ where: { id: blockId } });
  return { ok: true, data: await loadPages(assessmentId) };
}

export async function moveBlock(blockId: string, dir: "up" | "down"): Promise<ActionResult<AssessmentPageData[]>> {
  const block = await prisma.pageBlock.findUnique({ where: { id: blockId }, select: { pageId: true, page: { select: { assessmentId: true } } } });
  if (!block) return { ok: false, error: "Block not found." };
  if (!(await assessmentInScope(block.page.assessmentId))) return { ok: false, error: "Not found." };
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
  return { ok: true, data: await loadPages(block.page.assessmentId) };
}
