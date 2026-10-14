/**
 * Conditional-routing engine - pure, dependency-free (no React, no Prisma, no
 * server-only) so it runs identically in the public runner (client) and the
 * completion action (server), and is trivially unit-testable.
 *
 * Model (Phase 1):
 *  - Questions form a linear "spine": page-1 categories then page-2, each in
 *    displayOrder, questions in displayOrder. This is the SAME order the SINGLE
 *    display mode paginates in, so a spine index equals that mode's screen index.
 *  - Each ANSWER OPTION may carry a route. When the respondent picks that option,
 *    the flow does one of: continue linearly (NEXT), jump forward to a specific
 *    question (JUMP_TO_QUESTION) or category (JUMP_TO_CATEGORY), or end the
 *    questions (SKIP_TO_END).
 *  - Targets are FORWARD-ONLY (validated on save). The engine is defensive anyway:
 *    an unknown or non-forward target degrades to a linear NEXT, so a stale route
 *    (e.g. its target question was deleted) can never loop or strand a respondent.
 *
 * Nothing here reads the database; callers pass plain data.
 */

export type RouteActionValue =
  | "NEXT"
  | "JUMP_TO_QUESTION"
  | "JUMP_TO_CATEGORY"
  | "SKIP_TO_END";

export interface RouteSpec {
  action: RouteActionValue;
  targetQuestionId: string | null;
  targetCategoryId: string | null;
}

/** One question's place in the traversal spine. */
export interface SpineQuestion {
  id: string;
  categoryId: string;
  /**
   * The question's DEFAULT route: what happens when no option rule applies - the
   * question was skipped, it is FREE_TEXT (no options at all), or the chosen option
   * carries no rule of its own. Undefined/null = continue linearly.
   *
   * This is the half of branching that brings a branch BACK. An option rule can only
   * fire when its option is chosen, so without this a branch's optional or typed last
   * question falls through into the next branch's questions.
   */
  defaultRoute?: RouteSpec | null;
}

/** Category shape needed to build the spine (already ordered by displayOrder). */
export interface SpineCategory {
  id: string;
  page: number | null;
  questions: { id: string; defaultRoute?: RouteSpec | null }[];
}

/**
 * Build the traversal spine from ordered categories. Page 1 first, then page 2,
 * mirroring the runner's screen grouping so `spine[i]` lines up with SINGLE-mode
 * screen `i`. The input categories must already be in displayOrder.
 */
export function buildSpine(categories: SpineCategory[]): SpineQuestion[] {
  const out: SpineQuestion[] = [];
  for (const page of [1, 2]) {
    for (const c of categories) {
      if ((c.page ?? 1) !== page) continue;
      for (const q of c.questions) {
        out.push({ id: q.id, categoryId: c.id, defaultRoute: q.defaultRoute ?? null });
      }
    }
  }
  return out;
}

/**
 * Resolve one rule to a forward spine index, or null when it does not apply (no rule,
 * a plain NEXT, or a target that is missing / not strictly forward). "END" means the
 * rule ends the questions.
 */
function applyRoute(
  route: RouteSpec | null | undefined,
  currentIndex: number,
  spine: SpineQuestion[],
): number | "END" | null {
  if (!route || route.action === "NEXT") return null;
  if (route.action === "SKIP_TO_END") return "END";

  let targetId: string | null = null;
  if (route.action === "JUMP_TO_QUESTION") {
    targetId = route.targetQuestionId;
  } else if (route.action === "JUMP_TO_CATEGORY") {
    // First question of the target category that lies AFTER the current index.
    const catId = route.targetCategoryId;
    for (let i = currentIndex + 1; i < spine.length; i++) {
      if (spine[i]!.categoryId === catId) {
        targetId = spine[i]!.id;
        break;
      }
    }
  }
  if (!targetId) return null;

  const targetIndex = spine.findIndex((s) => s.id === targetId);
  // Forward-only guard: unknown or non-forward target does not apply.
  if (targetIndex <= currentIndex) return null;
  return targetIndex;
}

/**
 * Resolve the next spine index from the current one, given the chosen option (if
 * any). Returns a forward index or the sentinel "END".
 *
 * Precedence, and it matters:
 *  1. the chosen option's own rule,
 *  2. the question's DEFAULT route - which is why it also covers "they answered, but
 *     that answer has no rule of its own", not only a skip,
 *  3. a linear step.
 *
 * Anything that does not resolve to a strictly forward target falls through to the
 * next rung, so a stale route (deleted target, non-forward target) can never loop or
 * strand a respondent.
 */
export function nextIndex(
  currentIndex: number,
  chosenOptionId: string | undefined,
  spine: SpineQuestion[],
  byOption: Map<string, RouteSpec>,
): number | "END" {
  const linear: number | "END" =
    currentIndex + 1 >= spine.length ? "END" : currentIndex + 1;
  if (currentIndex < 0 || currentIndex >= spine.length) return "END";

  if (chosenOptionId !== undefined) {
    const chosen = applyRoute(byOption.get(chosenOptionId), currentIndex, spine);
    if (chosen !== null) return chosen;
  }
  const fallback = applyRoute(spine[currentIndex]!.defaultRoute, currentIndex, spine);
  if (fallback !== null) return fallback;
  return linear;
}

/**
 * Read a question row's three default-route columns as a RouteSpec. Null when the
 * question has no default (every question that predates the feature), which the engine
 * reads as a linear step. Kept here so the public page, the runner, the completion
 * action and the transfer format all map it identically.
 */
export function defaultRouteOf(q: {
  defaultRouteAction?: RouteActionValue | null;
  defaultTargetQuestionId?: string | null;
  defaultTargetCategoryId?: string | null;
}): RouteSpec | null {
  if (!q.defaultRouteAction) return null;
  return {
    action: q.defaultRouteAction,
    targetQuestionId: q.defaultTargetQuestionId ?? null,
    targetCategoryId: q.defaultTargetCategoryId ?? null,
  };
}

/** Does this flow have any routing at all - an option rule or a default route? */
export function hasRouting(
  spine: SpineQuestion[],
  byOption: Map<string, RouteSpec>,
): boolean {
  if (byOption.size > 0) return true;
  return spine.some((s) => s.defaultRoute != null && s.defaultRoute.action !== "NEXT");
}

export interface WalkResult {
  /** Question ids actually traversed, in visit order. */
  reached: string[];
  /** Same, as a set for membership tests. */
  reachedSet: Set<string>;
}

/**
 * Walk the flow from the first question, following each answered question's route
 * (an unanswered or typed question follows its default route, else advances
 * linearly), and return every question REACHED.
 * Skipped-by-jump questions are never reached, so callers exclude them from
 * required-answer enforcement and from scoring. Terminates because targets are
 * forward-only; a defensive guard breaks any impossible cycle.
 */
export function walk(
  answersByQuestion: Map<string, string>,
  spine: SpineQuestion[],
  byOption: Map<string, RouteSpec>,
): WalkResult {
  const reached: string[] = [];
  const seen = new Set<string>();
  let i = 0;
  let guard = 0;
  const maxSteps = spine.length + 1;
  while (i >= 0 && i < spine.length && guard <= maxSteps) {
    guard++;
    const q = spine[i]!;
    if (seen.has(q.id)) break; // safety: never revisit
    reached.push(q.id);
    seen.add(q.id);
    const opt = answersByQuestion.get(q.id);
    const nxt = nextIndex(i, opt, spine, byOption);
    if (nxt === "END") break;
    i = nxt;
  }
  return { reached, reachedSet: seen };
}
