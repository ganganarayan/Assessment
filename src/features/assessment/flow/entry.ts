/**
 * Where a run STARTS, and where it goes once the gates are cleared.
 *
 * The sibling of stages.ts (which answers where a run ends), and here for the same
 * reason: the decision was three expressions scattered through an 1,800-line client
 * component, and the one shape nobody tested - a funnel built entirely out of
 * qualification questions, with nothing scored after them - fell between them.
 *
 * Pure and dependency-free, so scripts/verify-gate.ts can pin it.
 */

/** The screen a respondent sees first, and the screen a cleared gate leads to. */
export type EntryStep = "qualify" | "gate" | "intro" | "leadForm" | "questions";

/** The only configuration the entry depends on. Structural: no imports from the
 *  runner (which would be a cycle), no model types. */
export interface EntryInput {
  /** Page-1 gate: is the switch on? */
  qualificationEnabled: boolean;
  /** Page-1 gate: how many questions are configured. */
  qualificationQuestions: number;
  /** Audience gate renders at all (FREETEXT, or DROPDOWN with at least one option). */
  audienceGate: boolean;
  /** SCORED questions the respondent would actually be shown (pages 1 and 2). */
  scoredQuestions: number;
  /** Opt-in comes AFTER the questions rather than being the first screen. */
  leadCaptureAfter: boolean;
}

/**
 * Is the qualification gate LIVE - i.e. will a respondent be asked these questions?
 *
 * 🔴 Both halves matter, and the second one is where a tenant lost an afternoon:
 * questions saved with the switch off are stored exactly as entered, shown in the
 * builder, and skipped by every respondent. The builder now says so out loud; this is
 * the one definition of "live" that both it and the funnel read.
 */
export function gateIsLive(a: EntryInput): boolean {
  return a.qualificationEnabled && a.qualificationQuestions > 0;
}

/**
 * The first screen of a run: the qualification gate, else the audience gate, else the
 * intro (which in lead-first mode IS the opt-in form).
 *
 * The gate comes first by definition - it decides whether this person is worth a lead
 * row at all, so nothing that creates one may precede it. That holds whether the
 * opt-in is configured before or after the questions.
 */
export function firstStep(a: EntryInput): EntryStep {
  if (gateIsLive(a)) return "qualify";
  if (a.audienceGate) return "gate";
  return "intro";
}

/**
 * Where a respondent goes once every gate is cleared.
 *
 * Lead-capture-AFTER: the intro is a title and a Start button, which after a gate is
 * pure friction, so it is skipped - to the questions when there are any, and straight
 * to the opt-in when the gate WAS the assessment.
 *
 * Lead-FIRST: the intro screen is the opt-in form, so it still renders; only its
 * landing copy is suppressed (the respondent has already started).
 */
export function afterGateStep(a: EntryInput): EntryStep {
  if (!gateIsLive(a) || !a.leadCaptureAfter) return "intro";
  return a.scoredQuestions > 0 ? "questions" : "leadForm";
}
