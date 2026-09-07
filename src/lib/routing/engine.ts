/**
 * Conditional-routing engine — pure, dependency-free (no React, no Prisma, no
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
}

/** Category shape needed to build the spine (already ordered by displayOrder). */
export interface SpineCategory {
  id: string;
  page: number | null;
  questions: { id: string }[];
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
      for (const q of c.questions) out.push({ id: q.id, categoryId: c.id });
    }
  }
  return out;
}

/**
 * Resolve the next spine index from the current one, given the chosen option (if
 * any). Returns a forward index or the sentinel "END". Falls back to a linear
 * step whenever there is no route, the route is NEXT, or the target is missing /
 * not strictly forward.
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
  if (chosenOptionId === undefined) return linear;

  const route = byOption.get(chosenOptionId);
  if (!route || route.action === "NEXT") return linear;
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
  if (!targetId) return linear;

  const targetIndex = spine.findIndex((s) => s.id === targetId);
  // Forward-only guard: unknown or non-forward target degrades to linear.
  if (targetIndex <= currentIndex) return linear;
  return targetIndex;
}

export interface WalkResult {
  /** Question ids actually traversed, in visit order. */
  reached: string[];
  /** Same, as a set for membership tests. */
  reachedSet: Set<string>;
}

/**
 * Walk the flow from the first question, following each answered question's route
 * (unanswered questions advance linearly), and return every question REACHED.
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
