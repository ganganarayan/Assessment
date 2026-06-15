/** Pure read-endpoint outcome: 404 missing, 410 expired, else 200 + snapshot. */
export interface ReadRow {
  resultSnapshot: unknown;
  resultTokenExpiresAt: Date | null;
}

export type ReadOutcome =
  | { status: 404; body: { error: string } }
  | { status: 410; body: { error: string } }
  | { status: 200; body: unknown };

export function readResult(row: ReadRow | null, now: number): ReadOutcome {
  if (!row || row.resultSnapshot == null) {
    return { status: 404, body: { error: "Not found" } };
  }
  if (row.resultTokenExpiresAt && row.resultTokenExpiresAt.getTime() < now) {
    return { status: 410, body: { error: "Expired" } };
  }
  return { status: 200, body: row.resultSnapshot };
}
