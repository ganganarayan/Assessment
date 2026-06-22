import type { StatementInput } from "@/lib/ai/types";
import { getPromptVersion } from "@/lib/ai/prompt-versions";

/**
 * Builds the system + user messages for the personalized result statement. PURE
 * (no env, no I/O) so it is unit-testable. The SYSTEM prompt comes from the
 * selected version (see prompt-versions.ts); a shared suffix tells the model to
 * use the assessment's own band words and to obey the admin's correction.
 */

const WORDS_MIN = 120;
const WORDS_MAX = 180;

export function buildStatementMessages(
  input: StatementInput,
  versionId?: string | null,
): { system: string; user: string } {
  const base = getPromptVersion(versionId).buildSystem(input, { min: WORDS_MIN, max: WORDS_MAX });

  // Use the assessment's OWN words so messages reflect each person's real result
  // and read differently person to person (not the same "you carry a lot").
  const bandLine =
    `This person's overall result is level ${input.bandLevel ?? "(none)"}` +
    `${input.band ? ` (${input.band})` : ""}. Use the assessment's own band words naturally where they fit, ` +
    `the overall level/title and any high or critical category bands, so the message reflects THEIR actual result. ` +
    `Do not force a word that does not fit, and never quote the raw numbers.`;

  const instr = input.instruction?.trim()
    ? `EDITOR INSTRUCTION (follow it exactly; it overrides the style defaults where they conflict): ${input.instruction.trim()}`
    : "";

  const system = [base, bandLine, instr].filter(Boolean).join(" ");

  // Each category line, then the answered questions behind it (text + the option
  // they chose + the points it scored). The per-question signal is what lets the
  // model say what the result MEANS instead of rewording the totals.
  const cats = input.categories
    .map((c) => {
      const head = `- ${c.name}: ${c.score}/${c.max}${c.band ? ` — band: ${c.band}` : ""}`;
      const qs = (c.questions ?? [])
        .map(
          (q) =>
            `    • ${q.text}${q.answer ? ` → answered "${q.answer}"` : ""} (${q.score}/${q.max})`,
        )
        .join("\n");
      return qs ? `${head}\n${qs}` : head;
    })
    .join("\n");

  const user = [
    `First name: ${input.firstName?.trim() || "there"}`,
    `Assessment: ${input.assessmentTitle}`,
    `Overall score: ${input.scoreRaw}/${input.max} (${input.percentage}%)`,
    `Overall band: ${input.band ?? "(none)"} (level: ${input.bandLevel ?? "(none)"})`,
    `Categories, their bands, and the questions behind each (with the answer chosen):`,
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
