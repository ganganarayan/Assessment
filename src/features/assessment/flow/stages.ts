/**
 * Where a completed run ENDS, derived from configuration.
 *
 * Pure and dependency-free on purpose: the runner is a 1,800-line client component,
 * and the decision about what happens after Submit was spread through it as a ladder
 * of `if`s inside the completion callback. Anything that needs to know the ending
 * before Submit (the countdown does) had to re-derive it, which is how the countdown
 * ended up applying to every path regardless of where it led.
 *
 * One function, one precedence order, checkable by scripts/verify-flow.ts.
 */

export type TerminalStage = "SIGNUP" | "RESULT_PAGES" | "PAYMENT" | "DESTINATION";

/** The only configuration the ending depends on. Structural, so this file never
 *  imports from the runner (which would be a cycle) and stays unit-testable. */
export interface FlowInput {
  /** Platform signup funnel: hand off to /sign-up after the completion event. */
  platformSignup: boolean;
  /** Published result-page-builder pages (0 = none). */
  pageCount: number;
  /** Pay to unlock. */
  paidMode: boolean;
  /** The owner's configured anticipation countdown, in seconds. */
  vslCountdownSeconds: number;
}

/**
 * The ending, in the SAME precedence the runner applies after completion:
 * signup handoff, then the page builder, then payment, then the destination.
 * Changing this order changes the funnel, so it lives in one place.
 */
export function terminalStage(a: FlowInput): TerminalStage {
  if (a.platformSignup) return "SIGNUP";
  if (a.pageCount > 0) return "RESULT_PAGES";
  if (a.paidMode) return "PAYMENT";
  return "DESTINATION";
}

/**
 * How long the post-Submit wait screen should COUNT for.
 *
 * The countdown is anticipation for a redirect to somewhere we do not control: the
 * owner's VSL or destination page. It buys the server time to score while the
 * respondent watches a number, and it never cuts scoring short.
 *
 * Every other ending renders its next screen the moment the server answers, so a
 * countdown there is dead air with a number on it - ten seconds of nothing between a
 * paid click and a signup form. Those get 0, which the wait screen shows as a plain
 * spinner with no number.
 *
 * Note this is derived, not configured per funnel type: no branch here names a
 * product. Point an assessment at a destination and the countdown applies; point it
 * anywhere else and it does not.
 */
export function waitSeconds(a: FlowInput): number {
  if (terminalStage(a) !== "DESTINATION") return 0;
  const n = Number(a.vslCountdownSeconds);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
