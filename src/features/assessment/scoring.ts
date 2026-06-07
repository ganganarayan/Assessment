/**
 * Scoring engine — pure, dependency-free so it is trivially testable and
 * reusable across the public submission flow and any future recalculation jobs.
 *
 * Model:
 *  - Each answered question contributes `value * weight` to its category.
 *  - Category score = sum of its answered questions' contributions.
 *  - Total score    = sum of all category scores.
 *  - maxScore       = sum of `maxValue * weight` over answered questions,
 *                     where maxValue is the question's highest option value.
 *  - Result band    = the band whose [minScore, maxScore] contains the total.
 */

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

  return {
    categoryScores: Array.from(byCategory.values()),
    totalScore,
    maxScore,
  };
}

/**
 * Pick the matching result band for a total score. Bands are evaluated in
 * display order; the first whose inclusive range contains the score wins.
 * Returns null if no band matches.
 */
export function pickResultBand<T extends ScoringBand>(
  bands: T[],
  totalScore: number,
): T | null {
  const ordered = [...bands].sort((a, b) => a.displayOrder - b.displayOrder);
  for (const band of ordered) {
    if (totalScore >= band.minScore && totalScore <= band.maxScore) {
      return band;
    }
  }
  return null;
}
