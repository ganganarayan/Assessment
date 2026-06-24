/**
 * Crisis-care resource line — TOP BAND ONLY (overall band CRITICAL and percentage
 * >= 90). The model writes a brief, varied, warm lead-in and emits a CRISIS_TOKEN
 * placeholder; this module swaps the token for the FIXED resource line. Crucially
 * this runs AFTER humanizeStatement, so the line's em dash and phone number are
 * never rewritten (humanize turns em dashes into commas). Pure + dependency-free
 * so it is unit-testable (see scripts/verify-ai.ts).
 */

export const CRISIS_TOKEN = "{{CRISIS_LINE}}";

/** The exact resource line. Never alter, rephrase, or regenerate this string. */
export const CRISIS_LINE =
  "If you ever feel you can't carry it alone right now, please reach out — in India you can call Tele-MANAS free, any time, on 14416.";

/** Highest band (CRITICAL) at 90% or above. */
export function qualifiesForCrisisLine(
  bandLevel: string | null | undefined,
  percentage: number | null | undefined,
): boolean {
  return (bandLevel ?? "").toUpperCase() === "CRITICAL" && (percentage ?? 0) >= 90;
}

/**
 * Apply the crisis rule to a (humanized) statement:
 *  - qualifying result with the token  -> token replaced by the verbatim line;
 *  - qualifying result without the token -> the verbatim line is appended (safety net);
 *  - non-qualifying result -> any stray token is stripped (line never shown).
 */
export function applyCrisisLine(
  text: string,
  bandLevel: string | null | undefined,
  percentage: number | null | undefined,
): string {
  const tidy = (s: string) => s.replace(/\n{3,}/g, "\n\n").trim();

  if (!qualifiesForCrisisLine(bandLevel, percentage)) {
    return tidy(text.split(CRISIS_TOKEN).join(""));
  }
  if (text.includes(CRISIS_TOKEN)) {
    return tidy(text.split(CRISIS_TOKEN).join(CRISIS_LINE));
  }
  return tidy(`${text}\n\n${CRISIS_LINE}`);
}
