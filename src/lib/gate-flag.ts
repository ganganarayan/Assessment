/**
 * Client-side memory of a qualification-gate rejection.
 *
 * A rejection used to be stored as a permanent `"1"`, never cleared anywhere, which
 * meant two things: a visitor who mis-clicked a disqualifying option could never
 * re-enter that funnel from the same browser, and every later visit re-fired the
 * `GateDisqualified` pixel event, inflating Meta's exclusion count far above the
 * number of people actually rejected.
 *
 * The flag now carries the rejection time and expires. Pure + storage-agnostic so it
 * is unit-testable and safe on either side of the render boundary.
 */

/** How long a gate rejection keeps a visitor on the exit page. After this they get a
 *  clean run at the gate, and a fresh rejection refreshes the Meta exclusion audience. */
export const GATE_DQ_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** localStorage key for one assessment's rejection (scoped per funnel). */
export function gateFlagKey(slug: string): string {
  return `gate_dq:${slug}`;
}

/**
 * The stored rejection time, or null when there is none, it is unreadable, or it has
 * expired.
 *
 * A legacy `"1"` (written before the TTL existed) reads as null ON PURPOSE: those
 * flags are permanent and include everyone locked out by the gate's pre-fix UI, where
 * options rendered without a visible radio. Treating them as expired gives that cohort
 * one clean retry; every write from here on carries a timestamp.
 */
export function readGateRejection(raw: string | null | undefined, now: number = Date.now()): number | null {
  if (!raw || raw === "1") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const at = (parsed as { at?: unknown }).at;
    if (typeof at !== "number" || !Number.isFinite(at)) return null;
    if (now - at >= GATE_DQ_TTL_MS) return null;
    return at;
  } catch {
    return null;
  }
}

/** The value to store for a rejection happening now. */
export function writeGateRejection(now: number = Date.now()): string {
  return JSON.stringify({ at: now });
}
