/**
 * Scoring engine — pure, dependency-free so it is trivially testable and
 * reusable across the public submission flow and any future recalculation jobs.
 *
 * Model:
 *  - Each answered question contributes `value * weight` to its category.
 *  - Category score = sum of its answered questions' contributions.
 *  - Total score    = sum of all category scores.
 *  - maxScore       = sum of `maxValue * weight` over ANSWERED questions,
 *                     where maxValue is the question's highest option value.
 *  - Result bands are matched against the PERCENTAGE (total / max * 100), NOT
 *    the absolute total. This makes banding invariant to how many OPTIONAL
 *    questions a respondent skipped (the achievable ceiling moves with the
 *    answered set, so only the ratio is comparable across submissions).
 *
 * All numeric outputs are rounded to 2 decimals to avoid float-precision drift
 * (fractional weights) pushing a score just outside an intended band boundary.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ScoringQuestion {
  id: string;
  categoryId: string;
  weight: number;
  /** Highest selectable option value for this question (e.g. 4 on a 1..4 scale). */
  maxValue: number;
}

export interface ScoringBand {
  id: string;
  minScore: number;
  maxScore: number;
  displayOrder: number;
}

export interface CategoryScore {
  categoryId: string;
  score: number;
  maxScore: number;
}

export interface ScoreResult {
  categoryScores: CategoryScore[];
  totalScore: number;
  maxScore: number;
  /** total / max as a 0–100 percentage (0 when max is 0). Banding basis. */
  percentage: number;
}

/**
 * Compute category + total scores from a map of questionId -> chosen value.
 * Only answered questions contribute (to both score and maxScore).
 */
export function computeScores(
  questions: ScoringQuestion[],
  answerValueByQuestionId: Map<string, number>,
): ScoreResult {
  const byCategory = new Map<string, CategoryScore>();
  let totalScore = 0;
  let maxScore = 0;

  for (const q of questions) {
    const value = answerValueByQuestionId.get(q.id);
    if (value === undefined) continue;

    const contribution = value * q.weight;
    const maxContribution = q.maxValue * q.weight;

    const existing = byCategory.get(q.categoryId) ?? {
      categoryId: q.categoryId,
      score: 0,
      maxScore: 0,
    };
    existing.score += contribution;
    existing.maxScore += maxContribution;
    byCategory.set(q.categoryId, existing);

    totalScore += contribution;
    maxScore += maxContribution;
  }

  const categoryScores = Array.from(byCategory.values()).map((cs) => ({
    categoryId: cs.categoryId,
    score: round2(cs.score),
    maxScore: round2(cs.maxScore),
  }));

  const roundedTotal = round2(totalScore);
  const roundedMax = round2(maxScore);
  const percentage =
    roundedMax > 0 ? round2((roundedTotal / roundedMax) * 100) : 0;

  return {
    categoryScores,
    totalScore: roundedTotal,
    maxScore: roundedMax,
    percentage,
  };
}

/**
 * Pick the matching result band for a score (the percentage in the public
 * flow). Total function: a completed submission ALWAYS receives a band.
 *  - exact match: first band whose inclusive [min, max] contains the score
 *    (ordered by minScore; an epsilon absorbs float drift);
 *  - below the lowest band  -> the lowest band;
 *  - above the highest band -> the highest band;
 *  - interior gap           -> the band with the nearest boundary.
 * Returns null only when there are no bands.
 */
export function pickResultBand<T extends ScoringBand>(
  bands: T[],
  score: number,
): T | null {
  if (bands.length === 0) return null;
  const ordered = [...bands].sort((a, b) => a.minScore - b.minScore);
  const lowest = ordered[0];
  const highest = ordered[ordered.length - 1];
  if (!lowest || !highest) return null;

  const EPS = 1e-9;
  for (const band of ordered) {
    if (score >= band.minScore - EPS && score <= band.maxScore + EPS) {
      return band;
    }
  }

  if (score < lowest.minScore) return lowest;
  if (score > highest.maxScore) return highest;

  // Interior gap: nearest boundary wins.
  let best = lowest;
  let bestDist = Infinity;
  for (const band of ordered) {
    const dist = Math.min(
      Math.abs(score - band.minScore),
      Math.abs(score - band.maxScore),
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = band;
    }
  }
  return best;
}
