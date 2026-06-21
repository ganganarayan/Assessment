/**
 * Pure builders for the public result snapshot (the exact GET /api/r/:token
 * shape) — no DB, so it is unit-testable and is the single source of truth for
 * both the read endpoint and webhook 2.
 */
import { pickResultBand, type ScoringBand } from "@/features/assessment/scoring";

/** A per-category band row (DB shape, minimal): percentage range -> label/meaning. */
export interface CategoryBandLike extends ScoringBand {
  label: string;
  meaning: string | null;
}

export interface CategoryResultEntry {
  name: string;
  score: number;
  max: number;
  band: string | null;
  meaning: string | null;
}

/** The exact JSON the read endpoint returns and webhook 2 mirrors. */
export interface ResultSnapshot {
  customerId: string;
  scorePercent: number;
  scoreRaw: number;
  max: number;
  resultBand: string | null;
  /** Overall band LEVEL (LOW/MEDIUM/HIGH/CRITICAL); optional for old snapshots. */
  resultBandLevel?: string | null;
  /** Overall band suggestion/advice text (the matched result band's description). */
  resultSuggestion: string | null;
  /** AI-generated personalized statement (null when AI is off/unavailable). */
  aiStatement: string | null;
  categories: CategoryResultEntry[];
}

/** Integer percentage (0–100). */
export function pct(score: number, max: number): number {
  return max > 0 ? Math.round((score / max) * 100) : 0;
}

/** Map one category's raw score to its band entry (band/meaning null if no bands). */
export function mapCategoryResult(
  name: string,
  score: number,
  max: number,
  bands: CategoryBandLike[],
): CategoryResultEntry {
  const band = bands.length ? pickResultBand(bands, pct(score, max)) : null;
  return { name, score, max, band: band?.label ?? null, meaning: band?.meaning ?? null };
}

export function buildResultSnapshot(args: {
  customerId: string;
  scoreRaw: number;
  max: number;
  scorePercent: number;
  resultBand: string | null;
  resultBandLevel?: string | null;
  resultSuggestion?: string | null;
  aiStatement?: string | null;
  categories: CategoryResultEntry[];
}): ResultSnapshot {
  return {
    customerId: args.customerId,
    scorePercent: args.scorePercent,
    scoreRaw: args.scoreRaw,
    max: args.max,
    resultBand: args.resultBand,
    resultBandLevel: args.resultBandLevel ?? null,
    resultSuggestion: args.resultSuggestion ?? null,
    aiStatement: args.aiStatement ?? null,
    categories: args.categories,
  };
}
