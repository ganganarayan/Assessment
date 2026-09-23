/**
 * Plain-text / Markdown assessment importer — parser.
 *
 * Turns a human-written spec into a structured draft the import action creates in
 * one transaction. Pure + deterministic (no AI), so scores are never misread and
 * every problem is reported as an error/warning shown in the preview.
 *
 * FORMAT (strict but forgiving of spacing):
 *
 *   Title: Emotional Stability Assessment
 *   Description: optional one-liner
 *
 *   ## Sleep & Recovery                 ← category (## Heading  OR  Category: Name)
 *   1. How well do you sleep?           ← question (must be NUMBERED: "1." or "1)")
 *      - Very poorly = 1                 ← option: "label = score" (score = integer)
 *      - Poorly = 2
 *      - Well = 3
 *   Bands:                              ← this category's own bands (optional)
 *      - 0-40 = Depleted | running on empty
 *      - 41-70 = Coping | holding, with strain
 *      - 71-100 = Strong | a real asset
 *
 *   ## Bands                           ← OVERALL result bands (LEVEL + range)
 *   - LOW 0-40 = Fragile | you're running on empty
 *   - MEDIUM 41-70 = Steady | room to grow
 *   - HIGH 71-100 = Resilient | strong foundation
 *
 * Questions are NUMBERED; options/bands are bullets ("-" or "*"). Band ranges are
 * percentages (0–100), inclusive, and must not overlap (a gap is only a warning).
 */

export type OverallLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
const LEVELS: OverallLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export interface ParsedOption {
  label: string;
  value: number;
}
export interface ParsedQuestion {
  text: string;
  options: ParsedOption[];
}
export interface ParsedCategoryBand {
  min: number;
  max: number;
  label: string;
  meaning: string | null;
}
export interface ParsedCategory {
  name: string;
  questions: ParsedQuestion[];
  bands: ParsedCategoryBand[];
}
export interface ParsedOverallBand {
  level: OverallLevel;
  min: number;
  max: number;
  title: string;
  description: string | null;
}
export interface ParsedAssessment {
  title: string;
  description: string | null;
  categories: ParsedCategory[];
  overallBands: ParsedOverallBand[];
}
export interface ParseResult {
  draft: ParsedAssessment | null;
  errors: string[];
  warnings: string[];
}

type Mode = "NORMAL" | "CAT_BANDS" | "OVERALL_BANDS";

const RE_META = /^([A-Za-z ]+):\s*(.*)$/;
const RE_HEADING = /^#{1,6}\s+(.*)$/;
const RE_CATEGORY_KW = /^category:\s*(.+)$/i;
const RE_QUESTION = /^(?:\d+[.)]|Q[:.])\s+(.+)$/i;
const RE_BULLET = /^[-*•]\s+(.+)$/;
const RE_OPTION = /^(.+?)\s*=\s*(-?\d+)\s*$/;
const RE_CAT_BAND = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*=\s*(.+)$/;
const RE_OVERALL_BAND = /^(LOW|MEDIUM|HIGH|CRITICAL)\s+(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*=\s*(.+)$/i;

/** Split "Title | Description" → [title, description|null]. */
function splitTitleDesc(s: string): [string, string | null] {
  const i = s.indexOf("|");
  if (i === -1) return [s.trim(), null];
  const title = s.slice(0, i).trim();
  const desc = s.slice(i + 1).trim();
  return [title, desc || null];
}

export function parseAssessmentText(input: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let title = "";
  let description: string | null = null;
  const categories: ParsedCategory[] = [];
  const overallBands: ParsedOverallBand[] = [];

  let curCat: ParsedCategory | null = null;
  let curQ: ParsedQuestion | null = null;
  let mode: Mode = "NORMAL";

  const lines = input.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const ln = idx + 1;
    const t = raw.trim();
    if (!t) return; // blank lines are ignored (don't end a bands block)

    // Overall bands section header: "## Bands" or "Overall bands:".
    if (/^#{1,6}\s*bands\s*$/i.test(t) || /^overall\s+bands?:?$/i.test(t)) {
      mode = "OVERALL_BANDS";
      return;
    }

    // Category heading: "## Name" (not Bands) or "Category: Name".
    const heading = RE_HEADING.exec(t);
    const catKw = RE_CATEGORY_KW.exec(t);
    const catName = catKw ? catKw[1]!.trim() : heading ? heading[1]!.trim() : null;
    if (catName && !/^bands$/i.test(catName)) {
      curCat = { name: catName, questions: [], bands: [] };
      categories.push(curCat);
      curQ = null;
      mode = "NORMAL";
      return;
    }

    // Per-category bands block: a lone "Bands:" line inside a category.
    if (/^bands:?$/i.test(t)) {
      if (!curCat) errors.push(`Line ${ln}: "Bands:" before any category.`);
      else mode = "CAT_BANDS";
      return;
    }

    // Meta lines (Title / Description / Engine) — only meaningful before content.
    const meta = RE_META.exec(t);
    if (meta && !RE_BULLET.test(t) && !RE_QUESTION.test(t)) {
      const key = meta[1]!.trim().toLowerCase();
      const val = meta[2]!.trim();
      if (key === "title") {
        title = val;
        return;
      }
      if (key === "description") {
        description = val || null;
        return;
      }
      if (key === "engine") {
        if (val && val.toUpperCase() !== "GENERIC") {
          warnings.push(`Line ${ln}: engine "${val}" ignored — import creates GENERIC assessments.`);
        }
        return;
      }
      // any other "Key: value" falls through to the checks below
    }

    // Question (numbered, or "Q:").
    const q = RE_QUESTION.exec(t);
    if (q) {
      if (!curCat) {
        errors.push(`Line ${ln}: question before any category — add a "## Category" first.`);
        return;
      }
      curQ = { text: q[1]!.trim(), options: [] };
      curCat.questions.push(curQ);
      mode = "NORMAL";
      return;
    }

    // Bullet lines: option, category band, or overall band depending on mode.
    const bullet = RE_BULLET.exec(t);
    if (bullet) {
      const body = bullet[1]!.trim();

      if (mode === "OVERALL_BANDS") {
        const m = RE_OVERALL_BAND.exec(body);
        if (!m) {
          errors.push(`Line ${ln}: bad overall band (expected "LEVEL min-max = Title | desc"): ${body}`);
          return;
        }
        const [t2, d2] = splitTitleDesc(m[4]!);
        overallBands.push({
          level: m[1]!.toUpperCase() as OverallLevel,
          min: Number(m[2]),
          max: Number(m[3]),
          title: t2,
          description: d2,
        });
        return;
      }

      if (mode === "CAT_BANDS") {
        const m = RE_CAT_BAND.exec(body);
        if (!m) {
          errors.push(`Line ${ln}: bad category band (expected "min-max = Label | meaning"): ${body}`);
          return;
        }
        const [lab, mean] = splitTitleDesc(m[3]!);
        curCat?.bands.push({ min: Number(m[1]), max: Number(m[2]), label: lab, meaning: mean });
        return;
      }

      // NORMAL → an answer option for the current question.
      if (!curQ) {
        errors.push(`Line ${ln}: option before any question: ${body}`);
        return;
      }
      const om = RE_OPTION.exec(body);
      if (om) {
        curQ.options.push({ label: om[1]!.trim(), value: parseInt(om[2]!, 10) });
      } else {
        // No "= score": auto-number by position and warn.
        const value = curQ.options.length + 1;
        curQ.options.push({ label: body, value });
        warnings.push(`Line ${ln}: option "${body}" had no "= score"; auto-assigned ${value}.`);
      }
      return;
    }

    warnings.push(`Line ${ln}: ignored (not a category, numbered question, or bullet): ${t}`);
  });

  // ---- structural validation ----
  // Only the ASSESSMENT structure blocks step 1. Bands are handled in step 2
  // (suggested → edited → imported), so any band problem here is a WARNING only.
  if (!title.trim()) errors.push('Missing "Title:" line.');
  if (categories.length === 0) errors.push("No categories found (use ## Category headings).");

  for (const c of categories) {
    if (c.questions.length === 0) {
      errors.push(`Category "${c.name}" has no questions.`);
    }
    for (const q of c.questions) {
      if (q.options.length < 2) {
        errors.push(`Question "${q.text}" in "${c.name}" needs at least 2 options.`);
      }
    }
    if (c.bands.length > 0) {
      const a = analyzeBands(c.bands, `Category "${c.name}" bands`);
      warnings.push(...a.errors, ...a.warnings); // fixable in step 2
    }
  }

  if (overallBands.length > 0) {
    const a = analyzeBands(overallBands, "Overall bands");
    warnings.push(...a.errors, ...a.warnings);
    const seen = new Set<OverallLevel>();
    for (const b of overallBands) {
      if (!LEVELS.includes(b.level)) warnings.push(`Overall band level "${b.level}" is not LOW/MEDIUM/HIGH/CRITICAL.`);
      if (seen.has(b.level)) warnings.push(`Overall band level "${b.level}" is used more than once.`);
      seen.add(b.level);
    }
  }

  const ok = errors.length === 0;
  return {
    draft: ok ? { title: title.trim(), description, categories, overallBands } : null,
    errors,
    warnings,
  };
}

/** Range sanity for a band set: 0–100 + min≤max + no overlap are ERRORS; gaps and
 *  not covering 0–100 are WARNINGS. Returned (not pushed) so callers decide whether
 *  band issues block (step-2 import) or only warn (step-1 parse). */
export function analyzeBands(
  ranges: { min: number; max: number }[],
  label: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const r of ranges) {
    if (r.min < 0 || r.max > 100) errors.push(`${label}: range ${r.min}-${r.max} is outside 0–100.`);
    if (r.min > r.max) errors.push(`${label}: range ${r.min}-${r.max} has min greater than max.`);
  }
  const sorted = [...ranges].sort((a, b) => a.min - b.min);
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const prev = sorted[i - 1]!;
    if (cur.min <= prev.max) {
      errors.push(`${label}: ranges overlap around ${cur.min} (use e.g. 0-40 then 41-70).`);
    } else if (cur.min > prev.max + 1) {
      warnings.push(`${label}: gap between ${prev.max} and ${cur.min}.`);
    }
  }
  if (sorted.length && sorted[0]!.min > 0) warnings.push(`${label}: does not start at 0.`);
  if (sorted.length && sorted[sorted.length - 1]!.max < 100) warnings.push(`${label}: does not reach 100.`);
  return { errors, warnings };
}
