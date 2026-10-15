"use server";

import { revalidatePath } from "next/cache";
import { RouteAction } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  questionRoutesInputSchema,
  type QuestionRoutesInput,
  type RouteActionValue,
} from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { assertEdit, resolveActingScope } from "@/lib/tenant/acting";
import { tenantCan } from "@/lib/billing/entitlements";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PARKED_MESSAGE } from "@/lib/billing/plans";
import { buildSpine } from "@/lib/routing/engine";
import { invalidatePublicAssessmentById } from "@/features/assessment/data";

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

  type Rule = {
    action: RouteAction;
    targetQuestionId: string | null;
    targetCategoryId: string | null;
  };
  /**
   * Validate ONE rule - an option's, or the question's default - into the triple that
   * gets stored. null = "no rule": for an option that is the absence of a row, for the
   * default that is three null columns, and both mean linear flow.
   *
   * Forward-only is enforced here because this is the only place a loop could be
   * created. The engine stays defensive about it anyway.
   */
  const resolveRule = (r: {
    action: RouteActionValue;
    targetQuestionId?: string;
    targetCategoryId?: string;
  }): Rule | null | { error: string } => {
    if (r.action === "NEXT") return null;
    if (r.action === "SKIP_TO_END") {
      return { action: RouteAction.SKIP_TO_END, targetQuestionId: null, targetCategoryId: null };
    }
    if (r.action === "JUMP_TO_QUESTION") {
      const t = (r.targetQuestionId ?? "").trim();
      const ti = t ? indexById.get(t) : undefined;
      if (ti === undefined) return { error: "Jump target question not found in this assessment." };
      if (ti <= currentIndex) return { error: "You can only jump to a LATER question." };
      return { action: RouteAction.JUMP_TO_QUESTION, targetQuestionId: t, targetCategoryId: null };
    }
    const t = (r.targetCategoryId ?? "").trim();
    const ci = t ? categoryFirstIndex.get(t) : undefined;
    if (ci === undefined) return { error: "Jump target category not found." };
    if (ci <= currentIndex) return { error: "You can only jump to a LATER category." };
    return { action: RouteAction.JUMP_TO_CATEGORY, targetQuestionId: null, targetCategoryId: t };
  };

  const upserts: (Rule & { optionId: string })[] = [];
  for (const r of parsed.data.routes) {
    if (!optionIds.has(r.optionId)) {
      return { ok: false, error: "Route references an option not on this question." };
    }
    const rule = resolveRule(r);
    if (rule && "error" in rule) return { ok: false, error: rule.error };
    if (!rule) continue; // no row = default linear flow
    upserts.push({ optionId: r.optionId, ...rule });
  }

  // The question's DEFAULT rule - what happens when no option rule applies (skipped,
  // typed, or an answer with no rule of its own). Absent or NEXT clears it to linear.
  const defaultRule = parsed.data.defaultRoute ? resolveRule(parsed.data.defaultRoute) : null;
  if (defaultRule && "error" in defaultRule) return { ok: false, error: defaultRule.error };
  const defaultData = {
    defaultRouteAction: defaultRule ? defaultRule.action : null,
    defaultTargetQuestionId: defaultRule ? defaultRule.targetQuestionId : null,
    defaultTargetCategoryId: defaultRule ? defaultRule.targetCategoryId : null,
  };

  // Billing gate: conditional logic & branching is on every paid tier. Adding a real
  // route (a JUMP or SKIP_TO_END) needs the feature; clearing routes back to the linear
  // default is always allowed. The app owner (super admin) is never limited.
  if (upserts.length > 0 || defaultRule) {
    const scope = await resolveActingScope();
    if (!scope.isSuper && !(await tenantCan(scope.tenantId, "conditionalRouting"))) {
      if ((await resolvePlan(scope.tenantId)).parked) return { ok: false, error: PARKED_MESSAGE };
      return { ok: false, error: "Conditional logic & branching needs a paid plan. Upgrade to add routing." };
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
    prisma.question.update({ where: { id: questionId }, data: defaultData }),
  ]);

  await invalidatePublicAssessmentById(assessmentId);
  revalidatePath(`/admin/assessments/${assessmentId}`);
  revalidatePath(`/w/assessments/${assessmentId}`);
  return { ok: true };
}
