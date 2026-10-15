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
/** The qualification gate's TEXT questions, extracted from the stored config. */
function asQualTextQuestions(v: unknown): { id: string; text: string }[] {
  const q = v && typeof v === "object" && !Array.isArray(v) ? (v as { questions?: unknown }).questions : null;
  if (!Array.isArray(q)) return [];
  return q
    .filter((x): x is { id: string; text: string; type?: string } =>
      !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string" && (x as { type?: string }).type === "text")
    .map((x) => ({ id: x.id, text: x.text }));
}

export function labeledAnswers(input: {
  optinFields: unknown;
  optinAnswers: unknown;
  preResultFields: unknown;
  preResultAnswers: unknown;
  /** Qualification gate config + the lead's text answers (manual-review fields). */
  qualification?: unknown;
  qualificationAnswers?: unknown;
}): LabeledAnswer[] {
  const out: LabeledAnswer[] = [];
  // Gate text answers first - they're the manual-qualification signals.
  const qa = asAnswers(input.qualificationAnswers);
  for (const q of asQualTextQuestions(input.qualification)) {
    const v = qa[q.id];
    if (v != null && String(v).trim()) out.push({ label: q.text, value: String(v) });
  }
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

/**
 * Read one string out of whatever a foreign file put in a field's slot.
 *
 * An option may arrive as a bare string, or as the OBJECT shape the qualification gate
 * uses for its answers ({ label, points, ... }). Both say the same thing to a reader;
 * only the first is something this app can render.
 */
function optionText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const key of ["label", "text", "value", "name", "title"]) {
      const s = o[key];
      if (typeof s === "string" && s.trim()) return s.trim();
    }
  }
  return "";
}

/** The field types a foreign file may name for what this app calls a dropdown. */
const SELECT_TYPES = new Set(["select", "choice", "dropdown", "radio", "multiple_choice", "multiplechoice", "single_choice"]);

/**
 * Normalize a stored or imported custom-field list into the two shapes this app can
 * actually render: a text box or a dropdown of strings.
 *
 * WHY THIS EXISTS. The portable format carries `preResultFields` and `optinFields` as
 * opaque JSON, so an imported file could write a field this app has no way to show - a
 * type of "textarea", or a "choice" whose options are the gate's {label, points}
 * objects. Nothing complained at import time; the damage surfaced two screens away.
 * The editor crashed trimming an option that was an object rather than a string, which
 * took the whole page with it, and before that every save of the assessment failed
 * validation pointing at a field on a step the owner was not even looking at. The
 * respondent's own page would have rendered an object as a dropdown option, which React
 * refuses outright.
 *
 * So a field is mapped to the nearest thing that works rather than rejected: any
 * choice-like type becomes a dropdown, every option is reduced to its label, anything
 * else becomes a text box, and a field with no label at all is dropped - it has nothing
 * to ask. Applied at every boundary a field can enter by (import, the editor, the public
 * page), so a bad file can neither be stored nor shown.
 */
export function normalizeCustomFields(v: unknown): PreResultField[] {
  if (!Array.isArray(v)) return [];
  const out: PreResultField[] = [];
  v.forEach((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const f = raw as Record<string, unknown>;
    const label = [f.label, f.text, f.title, f.question].find(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    if (!label) return;
    const rawType = typeof f.type === "string" ? f.type.trim().toLowerCase() : "";
    const options = Array.isArray(f.options)
      ? f.options.map(optionText).filter((o) => o.length > 0)
      : [];
    // A dropdown with nothing left to pick is a dead end, so it becomes a text box.
    const type: PreResultField["type"] =
      SELECT_TYPES.has(rawType) && options.length > 0 ? "select" : "text";
    out.push({
      id: typeof f.id === "string" && f.id.trim() ? f.id.trim() : `f${i + 1}`,
      label: label.trim(),
      type,
      options,
      required: f.required === true,
    });
  });
  return out;
}
