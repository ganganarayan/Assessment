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

/** Trim a string and return null when empty (for nullable DB columns). */
export function nullifyEmpty(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
