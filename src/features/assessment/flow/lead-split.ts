/**
 * SPLIT lead capture: which screens a run has, and in what order.
 *
 * The funnel asks for a name, then puts the respondent through the qualification gate,
 * then asks for an email the moment they qualify, then the assessment, then the phone
 * number one tap before the result. The point is that somebody who abandons half way
 * through twenty-one statements has already left an email behind, where today they
 * leave nothing.
 *
 * WHY A SEPARATE MODULE FROM entry.ts. That file answers the same question for the
 * single-screen mode, and the two orders genuinely differ: there the qualification gate
 * runs FIRST, because the opt-in that follows it creates a lead row and nothing that
 * creates one may precede the gate. Here the name screen runs before the gate, which is
 * safe only because a name is held in the session and written nowhere until the email
 * arrives - after the gate verdict. Threading that difference through entry.ts as a flag
 * would put the single-screen mode one bad branch away from capturing leads from people
 * it just rejected, so the two live apart and the runner picks one.
 *
 * Pure and dependency-free, so scripts/verify-lead-split.ts can pin it.
 */

/** The screens a split run can contain, in flow order. */
export type SplitStep =
  | "gate" // audience / profession picker
  | "leadName" // first name, last name (+ profession when there is no audience gate)
  | "qualify" // the page-1 qualification gate
  | "leadEmail" // email (+ any custom opt-in fields). The lead is written HERE.
  | "questions" // the scored assessment
  | "details" // the optional pre-result data-capture page
  | "leadPhone"; // phone, immediately before the result

/** Everything the order depends on. Structural: no model types, no imports. */
export interface LeadSplitInput {
  /** The assessment is configured for split capture. */
  splitMode: boolean;
  collectFirstName: boolean;
  collectLastName: boolean;
  collectEmail: boolean;
  collectMobile: boolean;
  collectProfession: boolean;
  /** The audience / profession picker renders at all. */
  audienceGate: boolean;
  /** The page-1 gate is enabled AND has questions (the entry.ts definition of live). */
  qualificationLive: boolean;
  /** Scored questions the respondent would actually be shown. */
  scoredQuestions: number;
  /** Custom opt-in fields configured on the assessment. */
  optinFieldCount: number;
  /** Pre-result data-capture fields configured on the assessment. */
  preResultFieldCount: number;
}

/**
 * Is split capture actually usable on this assessment?
 *
 * Email is structural, not a preference: it is the field whose arrival writes the lead
 * row and stamps emailCapturedAt, so a split funnel that does not collect one has no
 * moment at which anybody becomes a lead. The builder blocks this configuration on
 * save; this is the runtime half of the same rule, so a row that predates the check -
 * or one edited around it - degrades to the single-screen mode instead of running a
 * route that can never produce a lead.
 */
export function splitIsActive(a: LeadSplitInput): boolean {
  return a.splitMode && a.collectEmail;
}

/** Does the name screen have anything on it? Profession joins it only when the audience
 *  gate is off, because when the gate is on it already asked that question. */
export function nameScreenFields(a: LeadSplitInput): {
  firstName: boolean;
  lastName: boolean;
  profession: boolean;
} {
  return {
    firstName: a.collectFirstName,
    lastName: a.collectLastName,
    profession: a.collectProfession && !a.audienceGate,
  };
}

/** Is there anything to put on the name screen? */
export function hasNameScreen(a: LeadSplitInput): boolean {
  const f = nameScreenFields(a);
  return f.firstName || f.lastName || f.profession;
}

/**
 * The screens this run contains, in order.
 *
 * Every screen is conditional on having something to show, so turning a field off
 * removes its screen rather than rendering an empty one with a Next button. The order
 * itself never varies - that is the whole contract of this mode.
 */
export function splitSequence(a: LeadSplitInput): SplitStep[] {
  if (!splitIsActive(a)) return [];
  const steps: SplitStep[] = [];
  if (a.audienceGate) steps.push("gate");
  if (hasNameScreen(a)) steps.push("leadName");
  if (a.qualificationLive) steps.push("qualify");
  // Always present: splitIsActive guarantees an email is collected.
  steps.push("leadEmail");
  if (a.scoredQuestions > 0) steps.push("questions");
  if (a.preResultFieldCount > 0) steps.push("details");
  if (a.collectMobile) steps.push("leadPhone");
  return steps;
}

/** The first screen of a split run, or null when split is not active. */
export function splitFirstStep(a: LeadSplitInput): SplitStep | null {
  return splitSequence(a)[0] ?? null;
}

/** The screen after `step`, or null when `step` is the last one (which means the run
 *  completes next). An unknown step returns null rather than guessing. */
export function splitNextStep(a: LeadSplitInput, step: SplitStep): SplitStep | null {
  const seq = splitSequence(a);
  const i = seq.indexOf(step);
  if (i < 0) return null;
  return seq[i + 1] ?? null;
}

/**
 * The screen that captures the LAST lead field, and therefore the one that fires
 * CompleteRegistration.
 *
 * 🔴 Never the first. The whole promise of this mode is that contact details are taken
 * in stages, and a registration event fired on the first stage would report a lead that
 * is a name and nothing else - teaching the ad account to find more people who give a
 * name and leave. Derived here, server-side, rather than asserted by the browser.
 */
export function registrationStep(a: LeadSplitInput): SplitStep | null {
  if (!splitIsActive(a)) return null;
  const seq = splitSequence(a);
  for (let i = seq.length - 1; i >= 0; i--) {
    const s = seq[i];
    if (s === "leadPhone" || s === "leadEmail" || s === "leadName") return s;
  }
  return null;
}

/** Which custom opt-in fields ride with which screen. They sit with the email rather
 *  than the phone: extra questions one field away from the result is the worst place
 *  in the funnel to add friction. */
export function extrasOnEmailScreen(a: LeadSplitInput): boolean {
  return splitIsActive(a) && a.optinFieldCount > 0;
}

/** Human-readable screen order, for the builder's preview of this mode. */
export function splitPreviewLabels(a: LeadSplitInput): string[] {
  const f = nameScreenFields(a);
  const nameBits = [
    f.firstName ? "first name" : null,
    f.lastName ? "last name" : null,
    f.profession ? "profession" : null,
  ].filter(Boolean);
  return splitSequence(a).map((step) => {
    switch (step) {
      case "gate":
        return "Audience / profession";
      case "leadName":
        return `Name (${nameBits.join(", ")})`;
      case "qualify":
        return "Qualification gate";
      case "leadEmail":
        return extrasOnEmailScreen(a) ? "Email (+ your extra fields)" : "Email";
      case "questions":
        return "The assessment";
      case "details":
        return "Pre-result details";
      case "leadPhone":
        return "Phone, then the result";
    }
  });
}
