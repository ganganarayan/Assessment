/**
 * Crisis-care resource line - TOP BAND ONLY (overall band CRITICAL and percentage
 * >= 90). The model writes a brief, varied, warm lead-in and emits a CRISIS_TOKEN
 * placeholder; this module swaps the token for the FIXED resource line. Crucially
 * this runs AFTER humanizeStatement, so the line's em dash and phone number are
 * never rewritten (humanize turns em dashes into commas). Pure + dependency-free
 * so it is unit-testable (see scripts/verify-ai.ts).
 */

export const CRISIS_TOKEN = "{{CRISIS_LINE}}";

/** The exact resource line. Never alter, rephrase, or regenerate this string. */
export const CRISIS_LINE =
  "If you ever feel you can't carry it alone right now, please reach out - in India you can call Tele-MANAS free, any time, on 14416.";

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
 *  - qualifying result without the token -> appended ONLY when the prompt in use was
 *    told to emit the token (`appendIfMissing`), as a safety net for a model that
 *    forgot it;
 *  - non-qualifying result -> any stray token is stripped (line never shown).
 *
 * 🔴 WHY `appendIfMissing` EXISTS. The safety net used to be unconditional, and the
 * built-in prompts are the only ones that know about the token at all: a tenant's own
 * instructions are the WHOLE system prompt, so they never emit it, and the net fired on
 * every CRITICAL result at 90% or more whatever the funnel was about. A traveller who
 * answered twelve questions about a holiday in India - all twelve badly, so 100% - was
 * handed a mental health helpline under a paragraph about hotel vouchers. Alarming,
 * absurd in context, and nothing in that workspace's instructions asked for it.
 *
 * So the line now follows the prompt that asked for it. An owner who DOES want it writes
 * the token into their own instructions and gets it replaced verbatim, exactly as the
 * built-ins do. The band and percentage rule is unchanged for both.
 */
export function applyCrisisLine(
  text: string,
  bandLevel: string | null | undefined,
  percentage: number | null | undefined,
  opts?: { appendIfMissing?: boolean },
): string {
  const tidy = (s: string) => s.replace(/\n{3,}/g, "\n\n").trim();

  if (!qualifiesForCrisisLine(bandLevel, percentage)) {
    return tidy(text.split(CRISIS_TOKEN).join(""));
  }
  if (text.includes(CRISIS_TOKEN)) {
    return tidy(text.split(CRISIS_TOKEN).join(CRISIS_LINE));
  }
  // Default true, so every caller written before this keeps the net it was written with.
  if (opts?.appendIfMissing === false) return tidy(text);
  return tidy(`${text}\n\n${CRISIS_LINE}`);
}
