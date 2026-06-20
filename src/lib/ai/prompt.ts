import type { StatementInput } from "@/lib/ai/types";
import { getPromptVersion } from "@/lib/ai/prompt-versions";

/**
 * Builds the system + user messages for the personalized result statement. PURE
 * (no env, no I/O) so it is unit-testable. We pass RAW scores only — the model
 * does its own interpretation; we never send the admin's per-category bands. The
 * SYSTEM prompt comes from the selected version (see prompt-versions.ts).
 */

const WORDS_MIN = 100;
const WORDS_MAX = 150;

export function buildStatementMessages(
  input: StatementInput,
  versionId?: string | null,
): { system: string; user: string } {
  const system = getPromptVersion(versionId).buildSystem(input, { min: WORDS_MIN, max: WORDS_MAX });

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
