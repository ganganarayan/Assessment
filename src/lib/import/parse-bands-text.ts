import "server-only";
import { analyzeBands, type OverallLevel } from "./parse-assessment-text";

/**
 * Compact band parser for the "Import bands from text" box on an existing
 * assessment. The admin types just the ranges + the band names — nothing per line:
 *
 *   0 - 40% low, 41 - 55, 56 - 75, 76 to 100. Holding, Load-Bearing, Running Hot, Redlined
 *
 * We pull every score RANGE (in order) and every NAME (in order) and pair them:
 * range[i] → band[i] with title = name[i]. A level word attached to a range
 * (e.g. "0-40 low") sets that band's level; otherwise levels are auto-assigned
 * LOW→CRITICAL across the set. Everything stays editable afterwards.
 */

export interface CompactBand {
  level: OverallLevel;
  title: string;
  min: number;
  max: number;
}
export interface CompactBandsResult {
  bands: CompactBand[];
  errors: string[];
  warnings: string[];
}

const LEVELS: OverallLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const RANGE = /(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i;
const LEVEL_WORD = /\b(low|medium|high|critical)\b/i;

/** Spread a band's index across the 4 levels (n=4 → LOW,MEDIUM,HIGH,CRITICAL). */
function autoLevel(i: number, n: number): OverallLevel {
  if (n <= 1) return "LOW";
  return LEVELS[Math.min(3, Math.floor((i * 4) / n))]!;
}

export function parseCompactBands(input: string): CompactBandsResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Split on commas / semicolons / newlines, and on a period that is NOT a decimal
  // point (so "100. Holding" splits but "0.5" doesn't).
  const tokens = input
    .split(/[,;\n]+|\.(?!\d)/)
    .map((t) => t.trim())
    .filter(Boolean);

  const ranges: { min: number; max: number; level?: OverallLevel }[] = [];
  const labels: string[] = [];

  for (const tok of tokens) {
    const m = RANGE.exec(tok);
    if (m) {
      const rest = tok.replace(m[0], "");
      const lw = LEVEL_WORD.exec(rest);
      ranges.push({
        min: Number(m[1]),
        max: Number(m[2]),
        level: lw ? (lw[1]!.toUpperCase() as OverallLevel) : undefined,
      });
      continue;
    }
    // Not a range. A bare level word with no name is noise; anything else with
    // letters is a band name.
    const cleaned = tok.replace(/%/g, "").trim();
    if (!/[a-z]/i.test(cleaned)) continue;
    if (LEVEL_WORD.test(cleaned) && cleaned.replace(LEVEL_WORD, "").trim() === "") continue;
    labels.push(cleaned);
  }

  const n = ranges.length;
  if (n === 0) {
    errors.push("No score ranges found. Example: 0-40, 41-55, 56-75, 76-100");
    return { bands: [], errors, warnings };
  }
  if (labels.length !== n) {
    warnings.push(`Found ${n} range(s) but ${labels.length} name(s) — paired in order; fill any blanks after import.`);
  }

  const bands: CompactBand[] = ranges.map((r, i) => ({
    level: r.level ?? autoLevel(i, n),
    title: labels[i] ?? "",
    min: r.min,
    max: r.max,
  }));

  // Range sanity (0–100, min≤max, no overlap = errors; gaps/coverage = warnings).
  const a = analyzeBands(ranges.map((r) => ({ min: r.min, max: r.max })), "Bands");
  errors.push(...a.errors);
  warnings.push(...a.warnings);

  return { bands, errors, warnings };
}
