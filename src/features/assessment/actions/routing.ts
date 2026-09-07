"use server";

import { revalidatePath } from "next/cache";
import { RouteAction } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  questionRoutesInputSchema,
  type QuestionRoutesInput,
} from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { assertEdit } from "@/lib/tenant/acting";
import { buildSpine } from "@/lib/routing/engine";

/**
 * Save the conditional-routing rules for ONE question (the rules of its options).
 * A NEXT rule means "no route" and is stored as the ABSENCE of a row, so the
 * default flow needs no data. JUMP targets are validated to exist in the same
 * assessment and to be strictly FORWARD of this question (guarantees no loops).
 * Edit-guarded + scope-checked exactly like the question CRUD actions.
 */
export async function setQuestionRoutes(
  questionId: string,
  input: QuestionRoutesInput,
): Promise<ActionResult> {
  const parsed = questionRoutesInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid routing." };
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      category: { select: { assessmentId: true } },
      options: { select: { id: true } },
    },
  });
  if (!question) return { ok: false, error: "Question not found." };
  const assessmentId = question.category.assessmentId;
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  const denied = await assertEdit();
  if (denied) return denied;

  // Build the traversal spine to validate forward-only targets + category jumps.
  const categories = await prisma.category.findMany({
    where: { assessmentId },
    orderBy: { displayOrder: "asc" },
    select: {
      id: true,
      page: true,
      questions: { orderBy: { displayOrder: "asc" }, select: { id: true } },
    },
  });
  const spine = buildSpine(categories);
  const currentIndex = spine.findIndex((s) => s.id === questionId);
  if (currentIndex < 0) return { ok: false, error: "Question is not in the flow." };
  const indexById = new Map(spine.map((s, i) => [s.id, i] as const));
  const categoryFirstIndex = new Map<string, number>();
  spine.forEach((s, i) => {
    if (!categoryFirstIndex.has(s.categoryId)) categoryFirstIndex.set(s.categoryId, i);
  });
  const optionIds = new Set(question.options.map((o) => o.id));

  type Upsert = {
    optionId: string;
    action: RouteAction;
    targetQuestionId: string | null;
    targetCategoryId: string | null;
  };
  const upserts: Upsert[] = [];
  for (const r of parsed.data.routes) {
    if (!optionIds.has(r.optionId)) {
      return { ok: false, error: "Route references an option not on this question." };
    }
    if (r.action === "NEXT") continue; // no row = default linear flow

    if (r.action === "SKIP_TO_END") {
      upserts.push({ optionId: r.optionId, action: RouteAction.SKIP_TO_END, targetQuestionId: null, targetCategoryId: null });
      continue;
    }
    if (r.action === "JUMP_TO_QUESTION") {
      const t = (r.targetQuestionId ?? "").trim();
      const ti = t ? indexById.get(t) : undefined;
      if (ti === undefined) return { ok: false, error: "Jump target question not found in this assessment." };
      if (ti <= currentIndex) return { ok: false, error: "You can only jump to a LATER question." };
      upserts.push({ optionId: r.optionId, action: RouteAction.JUMP_TO_QUESTION, targetQuestionId: t, targetCategoryId: null });
      continue;
    }
    if (r.action === "JUMP_TO_CATEGORY") {
      const t = (r.targetCategoryId ?? "").trim();
      const ci = t ? categoryFirstIndex.get(t) : undefined;
      if (ci === undefined) return { ok: false, error: "Jump target category not found." };
      if (ci <= currentIndex) return { ok: false, error: "You can only jump to a LATER category." };
      upserts.push({ optionId: r.optionId, action: RouteAction.JUMP_TO_CATEGORY, targetQuestionId: null, targetCategoryId: t });
      continue;
    }
  }

  // Every option with a real route survives; the rest are cleared to default NEXT.
  const keep = new Set(upserts.map((u) => u.optionId));
  const del = [...optionIds].filter((id) => !keep.has(id));

  await prisma.$transaction([
    prisma.questionRoute.deleteMany({ where: { optionId: { in: del } } }),
    ...upserts.map((u) =>
      prisma.questionRoute.upsert({
        where: { optionId: u.optionId },
        create: {
          questionId,
          optionId: u.optionId,
          action: u.action,
          targetQuestionId: u.targetQuestionId,
          targetCategoryId: u.targetCategoryId,
        },
        update: {
          action: u.action,
          targetQuestionId: u.targetQuestionId,
          targetCategoryId: u.targetCategoryId,
        },
      }),
    ),
  ]);

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true };
}
