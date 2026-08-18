/**
 * Shared, pure formatting/derivation helpers for the clinic-audit calculation
 * trail — imported by BOTH the web result page and the PDF report so the two can
 * never render different numbers or different "assumed" tags for the same figure.
 * No React, no server-only: safe in a client bundle and in the PDF's Node render.
 */
import type { ClinicRole } from "./clinic-audit";

/** One decimal place, trimmed ("2.4", "2" not "2.0"). */
export function fmt1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** A funnel-stage count: one decimal under 20 (so small counts stay honest — never
 *  rounds a real 2.4 down to a misleading "2"), whole numbers above. */
export function fmtStep(n: number): string {
  if (n <= 0) return "0";
  return n < 20 ? fmt1(n) : String(Math.round(n));
}

/** The final "cases" step needs special handling: a sub-1 monthly rate must never
 *  render as a bare "0" (which would make "0 cases × price = revenue" look broken
 *  to a reader) — show the honest fraction plus a plain-English frequency. */
export function caseLine(n: number): { text: string; hint: string | null } {
  if (n <= 0) return { text: "0", hint: null };
  if (n < 1) {
    const months = Math.max(1, Math.round(1 / n));
    return { text: fmt1(n), hint: months <= 1 ? "roughly 1 case a month" : `roughly 1 case every ${months} months` };
  }
  return { text: fmtStep(n), hint: null };
}

/**
 * Whole patients. You cannot treat 1.4 people — the exact figure is what the funnel
 * mathematically yields, but the number of humans through the door is an integer.
 * Both are shown: the exact figure keeps the arithmetic checkable, the rounded one
 * is what actually happens. Rounds half up (1.4 → 1, 4.5 → 5, 4.8 → 5).
 */
export function roundPatients(n: number): number {
  return Math.round(n);
}

/** The revenue implied by the WHOLE-patient count, shown beside the exact figure. */
export function roundedRevenue(cases: number, treatmentValue: number): number {
  return roundPatients(cases) * treatmentValue;
}

/** Enquiries → booked → attended → cases, at a given rate chain. Cases uses the
 *  UNROUNDED chain (matches the engine's own casesNowExact/casesPotentialExact),
 *  so the displayed revenue always reconciles with the displayed case count. */
export function buildTrail(E: number, B: number, S: number, C: number) {
  const booked = E * B;
  const attended = booked * S;
  const cases = attended * C;
  return { booked, attended, cases };
}

/**
 * "assumed" / "assumed — avg of X" tag text for one figure, or null when it isn't
 * an assumption (an actual number was given) or the reader has since edited that
 * field (their edit is now their own number, not ours).
 */
export function assumedTagText(
  assumptions: string[] | undefined,
  assumedRangeLabel: Partial<Record<ClinicRole, string>> | undefined,
  role: ClinicRole,
  label: string,
  fieldEdited: boolean,
): string | null {
  // Both may be absent on a result computed from a snapshot persisted before these
  // fields existed — degrade to "no tag" rather than throwing on every old result.
  if (fieldEdited || !(assumptions ?? []).includes(label)) return null;
  const range = (assumedRangeLabel ?? {})[role];
  return range ? `assumed — avg of ${range}` : "assumed";
}
