/**
 * Pure read-endpoint outcome + the "which submission does a token serve" rule.
 *
 * EXPIRY IS DISABLED. Result-token links render regardless of age — the page must
 * work for re-engaged past takers whose 15/30-day window lapsed long ago. The
 * `resultTokenExpiresAt` column is kept (additive, non-destructive) but is no
 * longer enforced anywhere; readResult never returns 410. To re-introduce a
 * lifetime later, gate on that column here again — this is the single chokepoint.
 */
export interface ReadRow {
  resultSnapshot: unknown;
}

export type ReadOutcome =
  | { status: 404; body: { error: string } }
  | { status: 200; body: unknown };

export function readResult(row: ReadRow | null, _now?: number): ReadOutcome {
  if (!row || row.resultSnapshot == null) {
    return { status: 404, body: { error: "Not found" } };
  }
  return { status: 200, body: row.resultSnapshot };
}

/**
 * A submission considered for serving. `resultSnapshot` may be null for an
 * in-flight/never-completed row — such a row must never be served.
 */
export interface ServableRow {
  id: string;
  resultSnapshot: unknown;
}

/**
 * LATEST-ONLY resolution: a token identifies a person (via its own row's
 * identifier); the page must show that person's NEWEST completed reading, not the
 * one frozen into the token's original submission. The newest-completed row is
 * selected in SQL (ordered by completion); this pure step decides whether to use
 * it or fall back to the token's own row.
 *
 * Falls back to the token's own row when:
 *  - the person has no newer completed reading (newest is null), or
 *  - the newest candidate somehow has no snapshot (defensive — never serve blank).
 *
 * The result is what the read endpoint renders; there is no version navigator —
 * exactly one reading (the newest) is ever exposed publicly.
 */
export function chooseServedRow<T extends ServableRow>(tokenRow: T | null, newest: T | null): T | null {
  if (newest && newest.resultSnapshot != null) return newest;
  return tokenRow;
}
