/**
 * The qualification gate's arithmetic, as a pure function.
 *
 * WHY THIS FILE EXISTS. The same three decisions - does this answer end the visit,
 * what did the gate score, which band is that - were written out twice: once in
 * actions/gate-route.ts (the verdict the browser asks for) and once in
 * actions/submission.ts (the copy stamped on the row). Both are "use server" modules,
 * so nothing outside a request could import either, and scripts/verify-exit-routes.ts
 * says so in its own header: it reproduces the band arithmetic by hand because the real
 * one was unreachable. Two copies of the rule that decides who gets turned away, and a
 * third in the test that checks it.
 *
 * So the rule lives here, dependency-free, and the two server modules read it. Nothing
 * about the behaviour changes; what changes is that there is now one of it.
 */
import type { QualificationInput } from "@/features/assessment/schemas";
import type { GateAnswer } from "@/lib/result/gate";

/** What the gate awarded, and what it could have awarded. */
export interface GateTotals {
  score: number;
  /** The achievable ceiling, counting every ASKED choice question - matching how
   *  computeScores treats the assessment: a question nobody could score on still
   *  raises the bar. */
  max: number;
  /** One readable row per ANSWERED question, in question order. */
  rows: GateAnswer[];
  /** Picked option label per question id, for the stored answer map. */
  picks: Record<string, string>;
}

/**
 * Resolve the respondent's picks against the STORED gate.
 *
 * Only choice questions with options count: text questions are for manual review and
 * never score. An option id that does not exist is ignored rather than trusted, which
 * is the whole reason this resolves against the gate instead of the payload.
 */
export function gateTotals(
  q: QualificationInput | null,
  choices: Record<string, string> | null | undefined,
): GateTotals {
  const out: GateTotals = { score: 0, max: 0, rows: [], picks: {} };
  if (!q || !choices) return out;
  for (const question of q.questions) {
    if (question.type !== "choice" || question.options.length === 0) continue;
    const qMax = question.options.reduce((m, o) => Math.max(m, o.points), 0);
    out.max += qMax;
    const picked = question.options.find((o) => o.id === choices[question.id]);
    if (!picked) continue;
    out.score += picked.points;
    out.picks[question.id] = picked.label;
    out.rows.push({ q: question.text, a: picked.label, points: picked.points, max: qMax });
  }
  return out;
}

/**
 * Which band the gate put them in.
 *
 * Null when the funnel has no bands or awarded nothing: "this gate does not band
 * people" and "they landed in the bottom band" are different facts, and only one of
 * them should read as a deliberate tag later.
 *
 * Note what is NOT here: an exit. Somebody under reviewMin never reaches a submission,
 * because the verdict routed them out before one existed.
 */
export function gateBandOf(
  q: QualificationInput | null,
  score: number,
  max: number,
): "PASS" | "REVIEW" | null {
  if (!q || !q.bands.enabled || max <= 0) return null;
  return score >= q.bands.passMin ? "PASS" : "REVIEW";
}

export interface GateVerdict {
  outcome: "pass" | "review" | "exit";
  /** Set when outcome is "exit": which route to show. */
  exitKey?: string;
}

/**
 * The gate's verdict on one respondent.
 *
 * A disqualifying answer outranks any total: it is a statement about fit, not a score.
 * Then the bands, and only if they are enabled - a gate without bands is a yes/no door
 * and everybody who did not hit a disqualifying answer is through.
 */
export function gateVerdict(
  q: QualificationInput,
  choices: Record<string, string>,
): GateVerdict {
  for (const question of q.questions) {
    if (question.type !== "choice") continue;
    const picked = question.options.find((o) => o.id === choices[question.id]);
    if (picked?.disqualifies) return { outcome: "exit", exitKey: picked.exitKey ?? "" };
  }
  if (!q.bands.enabled) return { outcome: "pass" };
  const { score } = gateTotals(q, choices);
  if (score >= q.bands.passMin) return { outcome: "pass" };
  if (score >= q.bands.reviewMin) return { outcome: "review" };
  return { outcome: "exit", exitKey: q.bands.belowExitKey ?? "" };
}
