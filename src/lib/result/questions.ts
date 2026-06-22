/**
 * Per-question breakdown for one submission — the question text, the option the
 * respondent chose, and the weighted points it contributed. PURE (no DB) so it is
 * shared by the completion path (in-hand data) and the live loader (DB data), and
 * is unit-testable. Only ANSWERED questions are included, matching the scoring
 * model (a skipped optional question contributes to neither score nor max).
 *
 * Used for two things: (1) feeding the AI the real signal behind each category so
 * the statement derives MEANING rather than rewording the score, and (2) showing
 * the questions + their scores under each category on the result page.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface QuestionDetail {
  text: string;
  /** Label of the option the respondent chose (null if not resolvable). */
  answer: string | null;
  /** Weighted points this answer contributed (value * weight). */
  score: number;
  /** Weighted max for this question (highest option value * weight). */
  max: number;
}

export interface CategoryQuestionBreakdown {
  name: string;
  questions: QuestionDetail[];
}

/* ---- builder inputs (kept minimal so both call sites can satisfy them) ---- */

export interface BreakdownOption {
  id: string;
  value: number;
  label: string;
}
export interface BreakdownQuestion {
  id: string;
  text: string;
  weight: number;
  options: BreakdownOption[];
}
export interface BreakdownCategory {
  name: string;
  questions: BreakdownQuestion[];
}
/** The respondent's chosen answer for one question. */
export interface ChosenAnswer {
  value: number;
  optionId: string;
}

/**
 * Group the answered questions under their category, with the chosen answer label
 * and the weighted score/max. Categories with no answered question are omitted.
 */
export function buildCategoryQuestionBreakdown(
  categories: BreakdownCategory[],
  answerByQuestionId: Map<string, ChosenAnswer>,
): CategoryQuestionBreakdown[] {
  const out: CategoryQuestionBreakdown[] = [];
  for (const cat of categories) {
    const questions: QuestionDetail[] = [];
    for (const q of cat.questions) {
      const ans = answerByQuestionId.get(q.id);
      if (!ans) continue; // unanswered -> excluded (matches scoring)
      const maxValue = q.options.reduce((m, o) => Math.max(m, o.value), 0);
      const label = q.options.find((o) => o.id === ans.optionId)?.label ?? null;
      questions.push({
        text: q.text,
        answer: label,
        score: round2(ans.value * q.weight),
        max: round2(maxValue * q.weight),
      });
    }
    if (questions.length > 0) out.push({ name: cat.name, questions });
  }
  return out;
}
