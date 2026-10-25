/**
 * What has to be true before somebody can book the 30-minute setup call.
 *
 * WHY A LIST AND NOT A FLAG. "Have they finished onboarding" is the wrong question: the
 * sequence ends with three orientation screens about where to find their own stats, and
 * nobody should be kept off a call for not having read where the stats are. So the gate
 * is an explicit, short list of the things that decide whether the call can achieve
 * anything, and the rest of the sequence is theirs to do whenever they like.
 *
 * 🔴 THIS GATES THE BUTTON AND NOTHING ELSE. The sequence itself never blocks. They can
 * import a template, open the builder, edit it, preview it and publish it with every
 * item below outstanding, and they can skip any step they like. A skip simply leaves the
 * item on the list. The only consequence of an unmet prerequisite is that the booking
 * button has not lit up yet, and the ribbon says which ones are left.
 *
 * Client-safe on purpose, like steps.ts: the ribbon renders the same list the server
 * checks, so the button a tenant can see is the button the server will honour.
 */
import { ONBOARDING_STEPS } from "@/features/onboarding/steps";

export interface Prerequisite {
  /** The step key this is satisfied by. Its `short` is the ribbon's label. */
  key: string;
  /**
   * When set, the answer must EQUAL this. Answered-with-anything is not enough.
   *
   * Only `metaUse` needs it, and it is why the field exists: "not yet" is a perfectly
   * valid answer to whether they run Meta ads, and it is also the answer that makes the
   * Meta half of the call impossible. Treating it as answered would light the button for
   * somebody the call cannot help, and hide the pixel and token steps while doing it.
   */
  requires?: string;
}

/**
 * In sequence order, deliberately. The ribbon's items are links into the dialog, so
 * somebody who clicks the first and keeps going walks the rest in the order the sequence
 * asks them rather than being bounced backwards through it.
 *
 * The first five take ten seconds each and need nothing looked up. The Meta four are the
 * only ones anybody has to leave the app for, which is why the list is named in the
 * ribbon at all instead of being a count.
 */
export const BOOKING_PREREQUISITES: readonly Prerequisite[] = [
  { key: "whatYouSell" },
  { key: "pricePoint" },
  { key: "badLead" },
  { key: "afterTheYes" },
  { key: "industry" },
  { key: "metaUse", requires: "yes" },
  { key: "metaPixel" },
  { key: "metaCapiToken" },
  { key: "metaCheck" },
];

/** The shape this needs off a step. Structural, so OnboardingStepView satisfies it. */
export interface PrerequisiteStep {
  key: string;
  value: string | null;
  answered: boolean;
  skipped: boolean;
}

export interface Outstanding {
  key: string;
  short: string;
}

/**
 * The ribbon's label for a step, from the step definition and nowhere else.
 *
 * One source for it: a label kept beside the prerequisite list as well would be a second
 * copy of the same words, and the two would disagree the first time one was reworded.
 * The fallback is never reached in a shipped build, because verify:onboarding fails when
 * a prerequisite has no short label, but it is here so that a missing one renders as
 * something readable rather than as a blank link.
 */
export function shortLabel(key: string): string {
  const def = ONBOARDING_STEPS.find((s) => s.key === key);
  return def?.short ?? def?.question ?? key;
}

/**
 * Which prerequisites are still outstanding, in sequence order. Empty means bookable.
 *
 * A prerequisite that is not in `steps` is NOT outstanding. Steps leave the sequence
 * when a `when` closure rules them out, and an item nobody is being asked for must not
 * block a call: the Razorpay branch works the same way. The one answer that could have
 * hidden the Meta steps is handled by `requires` above, so this cannot silently drop the
 * pixel and the token.
 *
 * Skipped counts as outstanding. A skipped token is still a blank field on the call, and
 * the honest thing is to leave it on the list rather than treat moving past a question
 * as having answered it.
 */
export function outstandingPrerequisites(
  steps: ReadonlyArray<PrerequisiteStep>,
): Outstanding[] {
  const out: Outstanding[] = [];
  for (const p of BOOKING_PREREQUISITES) {
    const step = steps.find((s) => s.key === p.key);
    if (!step) continue;
    const satisfied =
      p.requires !== undefined ? step.value === p.requires : step.answered && !step.skipped;
    if (!satisfied) out.push({ key: p.key, short: shortLabel(p.key) });
  }
  return out;
}

/** How many items the ribbon names before it says "and N more". Mobile-first: four is
 *  what fits on a phone beside the countdown without the strip becoming a paragraph. */
export const RIBBON_NAMED_LIMIT = 4;
