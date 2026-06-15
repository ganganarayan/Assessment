/** Shared band-range validation (pure) — reused by overall + per-category bands. */
export interface Range {
  minScore: number;
  maxScore: number;
}

/** Two inclusive ranges overlap iff minA <= maxB AND maxA >= minB. */
export function rangeOverlaps(candidate: Range, others: Range[]): boolean {
  return others.some(
    (b) => candidate.minScore <= b.maxScore && candidate.maxScore >= b.minScore,
  );
}
