import { z } from "zod";

/**
 * The qualification gate as a RESULT: one row per question, resolved at the moment it
 * was answered.
 *
 * Why this exists at all: the gate is authored as a JSON blob on the assessment, not as
 * Category/Question rows, so none of the machinery that renders an assessment result can
 * see it. A gate-only funnel therefore scored 65 out of 114 and then rendered a result
 * page with the total and nothing else, because every breakdown in the app is built by
 * walking categories and a gate has none.
 *
 * Deliberately flat - no categories. A gate is a short list of questions, and inventing a
 * category layer to satisfy the existing renderer would be structure that exists only to
 * please code.
 *
 * Keys are short because this is stored per submission: `q` question, `a` their answer,
 * `points` what it scored, `max` what the best answer on that question would have scored.
 */
export const gateAnswerSchema = z.object({
  q: z.string(),
  a: z.string(),
  points: z.number(),
  max: z.number(),
});
export type GateAnswer = z.infer<typeof gateAnswerSchema>;

export const gateBreakdownSchema = z.array(gateAnswerSchema);

/**
 * Parse the stored column. NEVER throws: a result page must still render for a
 * submission whose breakdown is absent (taken before this existed) or malformed, so an
 * unreadable value is simply "no breakdown" rather than a broken page.
 */
export function parseGateBreakdown(raw: unknown): GateAnswer[] {
  const parsed = gateBreakdownSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Totals for a breakdown, for the line under the list. */
export function gateTotals(rows: ReadonlyArray<GateAnswer>): { score: number; max: number } {
  return rows.reduce(
    (acc, r) => ({ score: acc.score + r.points, max: acc.max + r.max }),
    { score: 0, max: 0 },
  );
}
