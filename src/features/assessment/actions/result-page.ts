"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertEdit } from "@/lib/tenant/acting";
import { readResultPage, type ResultPageData } from "@/features/assessment/result-page/blocks";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { docInScope } from "@/features/result-pages/data";
import { mirrorPublished } from "@/features/result-pages/mirror";

/**
 * VSL result-page persistence, scoped to a ResultPageDoc.
 *
 * The whole page (theme + ordered blocks) is still ONE JSON blob: ResultPageDoc.draft
 * is the editable draft, ResultPageDoc.published is the snapshot. Publish mirrors that
 * snapshot onto the bound assessment's resultPagePublished, which is what the token
 * page renders - so the live read path is unchanged and a page in the library is just
 * a draft until somebody binds and publishes it.
 *
 * Draft edits stay invisible until Publish. All writes are scoped + edit-gated.
 */

const MAX_BLOCKS = 40;

/** Load the editable draft (defaulted + sanitized). */
export async function loadResultPage(docId: string): Promise<ResultPageData> {
  const d = await prisma.resultPageDoc.findUnique({ where: { id: docId }, select: { draft: true } });
  return readResultPage(d?.draft ?? null);
}

/** Save the whole draft. The client sends the full page; we sanitize and cap it. */
export async function saveResultPage(docId: string, data: ResultPageData): Promise<ActionResult> {
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const clean = readResultPage(data);
  if (clean.blocks.length > MAX_BLOCKS) return { ok: false, error: `Too many blocks (max ${MAX_BLOCKS}).` };
  await prisma.resultPageDoc.update({
    where: { id: docId },
    data: { draft: clean as unknown as Prisma.InputJsonValue },
  });
  return { ok: true };
}

/** Publish: snapshot the draft onto the doc, then mirror it onto the bound assessment
 *  (what the token result page renders). A free page publishes to the library only. */
export async function publishResultPage(docId: string): Promise<ActionResult<{ publishedAt: string }>> {
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const draft = await loadResultPage(docId);
  if (draft.blocks.length === 0) return { ok: false, error: "Add at least one block before publishing." };
  const now = new Date();
  await prisma.resultPageDoc.update({
    where: { id: docId },
    data: { published: draft as unknown as Prisma.InputJsonValue, publishedAt: now },
  });
  await mirrorPublished(docId);
  return { ok: true, data: { publishedAt: now.toISOString() } };
}

/** Unpublish: clear the live snapshot so the result page falls back to the score
 *  cards. The draft is kept, so Publish later restores the page. */
export async function unpublishResultPage(docId: string): Promise<ActionResult> {
  if (!(await docInScope(docId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.resultPageDoc.update({
    where: { id: docId },
    data: { published: Prisma.DbNull, publishedAt: null },
  });
  await mirrorPublished(docId);
  return { ok: true };
}
