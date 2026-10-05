import { type TerminalStage } from "@/features/assessment/flow/stages";

/**
 * Default respondent-facing copy for the SYSTEM screens: the ones the respondent
 * reaches by state rather than by answering anything (retake lock, scoring wait).
 *
 * Why a module and not strings in the component: this copy is shown to other
 * people's customers. The retake lock used to say "Meaningful emotional and
 * behavioural change requires time and consistent implementation", which is coaching
 * language written for one assessment and rendered on every assessment in the
 * system, including B2B lead-qualification funnels running paid traffic.
 *
 * Everything here is product-neutral and says only what is true of any assessment.
 * These are DEFAULTS: the per-assessment overrides land on top of this file, so the
 * screens have one home before they become editable rather than after.
 */

export const STAGE_DEFAULTS = {
  /** Retake lock, policy NEVER. */
  onceOnly: {
    heading: "You have already completed this assessment",
    body: "This assessment can be taken only once.",
  },
  /** Retake lock, policy DELAYED. The next date is appended when one is known. */
  alreadyCompleted: {
    heading: "You have already completed this assessment",
    body: "Your answers have been recorded, so there is nothing more to do right now.",
    /** Sentence appended when a next-available date exists. */
    nextAvailablePrefix: "You can take it again from",
  },
  /** The wait screen between Submit and whatever comes next. */
  evaluating: {
    label: "Analyzing your results…",
  },
  /** The opt-in form's own heading. Terminal-aware, see optinHeading below. */
  optin: {
    heading: "Almost done",
    resultSubtext: "Enter your details to see your results.",
    signupSubtext: "Enter your details to start your trial.",
  },
} as const;

/**
 * The opt-in form's heading and sub-line.
 *
 * It used to say "Enter your details to see your results" on every funnel, including
 * the signup funnel, where there are no results: that run ends at /sign-up and never
 * renders one. Promising a result there is both a distraction and untrue, which is the
 * sort of mismatch a respondent feels without being able to name.
 */
export function optinCopy(terminal: TerminalStage): { heading: string; subtext: string } {
  return {
    heading: STAGE_DEFAULTS.optin.heading,
    subtext:
      terminal === "SIGNUP"
        ? STAGE_DEFAULTS.optin.signupSubtext
        : STAGE_DEFAULTS.optin.resultSubtext,
  };
}
