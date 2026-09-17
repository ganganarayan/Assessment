"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { assertEdit } from "@/lib/tenant/acting";
import { readResultPage, type ResultPageData } from "@/features/assessment/result-page/blocks";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * VSL result-page persistence. The whole page (theme + ordered blocks) is stored as
 * ONE JSON blob — Assessment.resultPage is the editable DRAFT, resultPagePublished is
 * the live snapshot the token result page renders. Draft edits stay invisible until
 * Publish, mirroring the relational pages builder. All writes are scoped + edit-gated.
 */

const MAX_BLOCKS = 40;

/** Load the editable draft (defaulted + sanitized). */
export async function loadResultPage(assessmentId: string): Promise<ResultPageData> {
  const a = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { resultPage: true } });
  return readResultPage(a?.resultPage ?? null);
}

/** Save the whole draft. The client sends the full page; we sanitize and cap it. */
export async function saveResultPage(assessmentId: string, data: ResultPageData): Promise<ActionResult> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const clean = readResultPage(data);
  if (clean.blocks.length > MAX_BLOCKS) return { ok: false, error: `Too many blocks (max ${MAX_BLOCKS}).` };
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { resultPage: clean as unknown as Prisma.InputJsonValue },
  });
  return { ok: true };
}

/** Publish: snapshot the draft into resultPagePublished (what the token page renders). */
export async function publishResultPage(assessmentId: string): Promise<ActionResult<{ publishedAt: string }>> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  const draft = await loadResultPage(assessmentId);
  if (draft.blocks.length === 0) return { ok: false, error: "Add at least one block before publishing." };
  const now = new Date();
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { resultPagePublished: draft as unknown as Prisma.InputJsonValue, resultPagePublishedAt: now },
  });
  return { ok: true, data: { publishedAt: now.toISOString() } };
}

/** Unpublish: clear the live snapshot so the result page falls back to the score
 *  cards. The draft is kept, so Publish later restores the page. */
export async function unpublishResultPage(assessmentId: string): Promise<ActionResult> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  { const __d = await assertEdit(); if (__d) return __d; }
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { resultPagePublished: Prisma.DbNull, resultPagePublishedAt: null },
  });
  return { ok: true };
}
