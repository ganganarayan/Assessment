/**
 * What a case DOES, and what the funnel should do about it.
 *
 * A CasePlan is the respondent's decisions, nothing else: which role, which gate
 * answers, which scored answers, and any awkward thing to do on the way (reload, back
 * button, walk away at the opt-in). An Expectation is what the funnel must then do,
 * computed from the funnel's own configuration by the app's own pure modules.
 *
 * Keeping the two apart is what makes the sweep honest: the plan is generated from the
 * config, the expectation is derived from the config, and the OBSERVED behaviour comes
 * from a browser that was told nothing except which buttons to press.
 */
import type { EntryStep } from "../../../src/features/assessment/flow/entry.js";
import type { TerminalStage } from "../../../src/features/assessment/flow/stages.js";
import type { ExitMode } from "../../../src/features/assessment/schemas.js";

export type CaseKind = "entry" | "audience" | "gate" | "routes" | "bands" | "edge";

export type Behaviour =
  /** Reload the page mid-run; the funnel must not lose its place or double-count. */
  | "reload-mid-flow"
  /** Press back after being turned away; the exit must hold. */
  | "back-after-exit"
  /** Reach the opt-in and leave without submitting. */
  | "abandon-at-optin"
  /** Run the same identity twice; the second must hit the retake lockout. */
  | "retake"
  /** Try to continue with a required question unanswered. */
  | "skip-required";

export interface CasePlan {
  /** Stable, so --case=<id> replays exactly this one. */
  id: string;
  kind: CaseKind;
  /** One line for the report, written from the respondent's side. */
  title: string;
  /** Audience gate: a role id to pick, or text to type (FREETEXT). */
  audienceRoleId?: string;
  audienceText?: string;
  /** Qualification gate: questionId -> optionId. */
  gateChoices: Record<string, string>;
  /** Qualification gate: questionId -> typed answer (manual-review questions). */
  gateTexts: Record<string, string>;
  /** Scored questions: questionId -> optionId. */
  answers: Record<string, string>;
  behaviours: Behaviour[];
}

export interface ExpectedGate {
  outcome: "pass" | "review" | "exit";
  /** The exit the verdict names, resolved against the funnel's exits. */
  exitKey: string | null;
  exitName: string | null;
  exitMode: ExitMode | null;
  exitHeading: string | null;
  exitButtonLabel: string | null;
  exitButtonUrl: string | null;
  score: number;
  max: number;
  band: "PASS" | "REVIEW" | null;
  /** A PAGE exit: the run ends, no lead, no submission. */
  turnedAway: boolean;
  /** OPTIN or CONTINUE: their details are taken. */
  capturesLead: boolean;
  /** CONTINUE: they go on and answer the assessment anyway. */
  takesAssessment: boolean;
}

export interface ExpectedRows {
  /** A Submission row should exist for this identity. */
  submission: boolean;
  /** That row should carry the lead fields. */
  lead: boolean;
  /** A GateEntry row (the visitor passed the gate). */
  gateEntry: boolean;
  /** A GateDisqualification row (the visitor was turned away). */
  disqualification: boolean;
  /** The submission should reach COMPLETED. */
  completed: boolean;
}

export interface Expectation {
  /** The screen the run opens on. */
  firstStep: EntryStep;
  /** Where a cleared gate leads. */
  afterGate: EntryStep;
  gate: ExpectedGate | null;
  /** Question ids the respondent should be shown, in order. */
  questionPath: string[];
  /** Question ids the routing should SKIP past. */
  skipped: string[];
  /** Where the run ends, or null when it was turned away first. */
  terminal: TerminalStage | null;
  /** Another assessment the audience role should hand off to. */
  redirectToSlug: string | null;
  score: {
    total: number;
    max: number;
    percentage: number;
    gateScore: number;
    gateMax: number;
    bandId: string | null;
    bandTitle: string | null;
    bandLevel: string | null;
  } | null;
  rows: ExpectedRows;
  /** Meta events this case should fire, and ones it must never fire. */
  events: { fired: string[]; never: string[] };
  /** The respondent reached the opt-in form, so GateEntry.optinSeenAt must be stamped
   *  (that flag is what separates "saw the ask and refused it" from "never got there",
   *  which are two different audiences). */
  optinSeen: boolean;
  /** The run was deliberately left at the opt-in: no lead, no submission, and the
   *  abandonment sweep owes them an AssessmentAbandoned later. */
  abandonsAtOptin: boolean;
  /** The run was deliberately stopped by a required question. */
  blockedAtRequired: boolean;
  /** The SECOND attempt by the same identity must be refused by the retake lockout. */
  expectsRetakeLockout: boolean;
  /** The departure clock should be running: they left the opt-in, so the funnel owes
   *  them an abandonment verdict ten minutes later. */
  abandonDue: boolean;
  /** Which event that verdict should fire, or null when none is owed.
   *  AssessmentAbandoned once they have SEEN the ask, GateIncomplete when they never
   *  got that far - two audiences, and an ad written for one is wrong for the other. */
  abandonEvent: string | null;
}
