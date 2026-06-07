/** Shared types/helpers for server actions. */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Trim a string and return null when empty (for nullable DB columns). */
export function nullifyEmpty(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
