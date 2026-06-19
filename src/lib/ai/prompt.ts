import type { StatementInput } from "@/lib/ai/types";

/**
 * Builds the system + user messages for the personalized result statement. PURE
 * (no env, no I/O) so it is unit-testable. We pass RAW scores only — the model
 * does its own interpretation; we never send the admin's per-category bands.
 */

const WORDS_MIN = 100;
const WORDS_MAX = 150;

export function buildStatementMessages(input: StatementInput): { system: string; user: string } {
  const system = [
    `You are writing a short, warm, personal message to someone who just completed "${input.assessmentTitle}".`,
    `Write in second person and address them by their first name.`,
    `Based ONLY on the scores provided, describe — with empathy and specificity — what they are most likely experiencing day to day.`,
    `Sound like a perceptive, caring human mentor, NOT an AI: natural and warm, no jargon, no bullet points, no headings, and do NOT quote the raw numbers or percentages back.`,
    `Do NOT use em dashes (—) or en dashes (–) — use commas, "and", or short sentences instead. Avoid punctuation patterns that read as AI-written.`,
    `Write ${WORDS_MIN}–${WORDS_MAX} words, easy to read, in flowing prose.`,
    `Use the overall band and any guidance to understand the direction of the scores (for example, higher scores may mean more struggle, not less).`,
    `Finish with one or two sentences that gently but compellingly encourage them to watch the video all the way to the end, because it speaks directly to what they are going through.`,
    `Output only the message text — no preamble, no quotes around it.`,
  ].join(" ");

  const cats = input.categories
    .map((c) => `- ${c.name}: ${c.score}/${c.max}`)
    .join("\n");

  const user = [
    `First name: ${input.firstName?.trim() || "there"}`,
    `Assessment: ${input.assessmentTitle}`,
    `Overall score: ${input.scoreRaw}/${input.max} (${input.percentage}%)`,
    `Overall band: ${input.band ?? "(none)"}`,
    `Category scores:`,
    cats || "(none)",
    `Guidance: ${input.guidance?.trim() || "(none)"}`,
  ].join("\n");

  return { system, user };
}

/**
 * Strip the AI "tells" from a statement: replace em/en dashes with commas and
 * tidy spacing, so the copy reads human-written. Pure (testable).
 */
export function humanizeStatement(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ") // em/en dash -> comma
    .replace(/,\s*,/g, ", ") // collapse accidental double commas
    .replace(/\s+([,.;:!?])/g, "$1") // no space before punctuation
    .replace(/ {2,}/g, " ") // collapse runs of spaces
    .trim();
}
