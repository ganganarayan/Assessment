import { type PreResultField } from "@/features/assessment/schemas";

/** A configured custom field paired with a lead's answer. */
export interface LabeledAnswer {
  label: string;
  value: string;
}

function asFields(v: unknown): PreResultField[] {
  return Array.isArray(v)
    ? (v as PreResultField[]).filter((f) => f && typeof f === "object" && typeof f.label === "string" && f.label.trim())
    : [];
}

function asAnswers(v: unknown): Record<string, string> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
}

/**
 * Pair each configured custom field (opt-in first, then pre-results) with the lead's
 * saved answer, in field order, skipping blanks. Used to display + export the answers
 * with their human labels (the submission stores them keyed by field id).
 */
export function labeledAnswers(input: {
  optinFields: unknown;
  optinAnswers: unknown;
  preResultFields: unknown;
  preResultAnswers: unknown;
}): LabeledAnswer[] {
  const out: LabeledAnswer[] = [];
  const oa = asAnswers(input.optinAnswers);
  for (const f of asFields(input.optinFields)) {
    const v = oa[f.id];
    if (v != null && String(v).trim()) out.push({ label: f.label, value: String(v) });
  }
  const pa = asAnswers(input.preResultAnswers);
  for (const f of asFields(input.preResultFields)) {
    const v = pa[f.id];
    if (v != null && String(v).trim()) out.push({ label: f.label, value: String(v) });
  }
  return out;
}

/** Flatten to a single string for CSV / search, e.g. "Company size: 11-50 | Goal: Growth". */
export function labeledAnswersText(pairs: LabeledAnswer[]): string {
  return pairs.map((p) => `${p.label}: ${p.value}`).join(" | ");
}
