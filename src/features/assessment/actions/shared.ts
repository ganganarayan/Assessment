/** Shared types/helpers for server actions. */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** One option's prior state, used to undo (Revert) a "copy options to all".
 *  questionId lets the UI offer Revert per affected question row. */
export interface OptionSnapshot {
  questionId: string;
  id: string;
  label: string;
  value: number;
}

/**
 * What the funnel will actually do with the qualification gate that was just saved,
 * returned so the builder can SAY it rather than leaving the owner to infer it.
 *
 * 🔴 The failure this exists for: questions saved with `enabled` false are stored
 * perfectly and then ignored by every respondent, and "Qualification saved." was all
 * anybody was told. The owner sees their gate in the builder, the funnel skips it, and
 * nothing explains the difference.
 *
 * Lives HERE, not in the action file: a "use server" module may export async functions
 * only, and a type exported from one fails the Railway build while typechecking clean.
 */
export interface QualificationSaveState {
  /** True when the funnel will show the gate (enabled AND at least one question). */
  live: boolean;
  questionCount: number;
}

/** Trim a string and return null when empty (for nullable DB columns). */
export function nullifyEmpty(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
