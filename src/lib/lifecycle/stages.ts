/**
 * THE STAGE CATALOGUE - every thing this engine is allowed to say.
 *
 * Pure and client-safe (no prisma, no server-only), the same contract as
 * lib/features/catalog.ts. The review screen renders from it, the router picks from
 * it, and the model is handed it as the menu it must choose from.
 *
 * 🔴 THE MODEL CANNOT INVENT A STAGE. It returns a key, that key is checked against
 * this list, and a key that is not here is a rejected decision rather than a new kind
 * of message. That is what keeps a daily autonomous sender inside a shape somebody
 * reviewed once, on purpose.
 *
 * Each stage carries an `intent`, not finished copy. The words are written per person
 * from their own facts, which is the whole point of the engine; what is fixed here is
 * WHAT this moment is for, and what it must not do. A stage is a brief, not a draft.
 *
 * 🟡 `waTemplate` is a Meta-approved template NAME and nothing else. The variables it
 * takes are short values: a first name, a number of days, one next step, a link.
 * A template whose body is one long free-text variable does not survive Meta's review,
 * and pushing a paragraph through an approved shell is template-review circumvention.
 * It costs the quality rating first, then the number's messaging limit. Stages that
 * are email-only leave it null, and that is the normal case.
 */

/** Which channels a stage may use. Email is always on; WhatsApp is the exception. */
export interface StageChannels {
  email: true;
  /** Null = email only. A template name = WhatsApp is allowed on this stage too. */
  waTemplate: string | null;
  /** How many short slots that template takes. Checked against what the model returns. */
  waSlots: number;
}

export interface LifecycleStage {
  key: string;
  /** What the owner sees in the review screen. */
  label: string;
  /** The trial days this stage is reachable on. Inclusive. */
  days: readonly [number, number];
  /** What this message is FOR. Handed to the model verbatim. */
  intent: string;
  /** What it must not do. Also handed over verbatim, and it matters more than intent. */
  avoid: string;
  channels: StageChannels;
}

/**
 * 🟡 WHATSAPP IS ON SIX STAGES, NOT TWELVE, and that is a deliberate ceiling rather
 * than an oversight. Daily marketing templates for a fortnight to the same person is
 * how a number gets reported and throttled, and it reads as desperation besides. Email
 * carries the sequence; WhatsApp marks the moments that genuinely cannot wait.
 */
export const LIFECYCLE_STAGES: readonly LifecycleStage[] = [
  {
    key: "welcome",
    label: "Day 1 - welcome and the first step",
    days: [1, 1],
    intent:
      "Thank them for signing up, state plainly how many days of trial are left, and name the ONE next thing: build the first scorecard. If they have already started, acknowledge exactly where they stopped and point at the step after it.",
    avoid:
      "Do not list every feature. Do not mention the call yet, because they have not seen the product work.",
    channels: { email: true, waTemplate: "trial_welcome", waSlots: 3 },
  },
  {
    key: "no_login",
    label: "Never signed in",
    days: [2, 13],
    intent:
      "They created the workspace and never came back. One short message: the single reason to open it today, and the link. Name the days left.",
    avoid:
      "Do not ask what went wrong, and do not apologise for writing.",
    channels: { email: true, waTemplate: "trial_resume", waSlots: 3 },
  },
  {
    key: "resume_onboarding",
    label: "Onboarding started, not finished",
    days: [2, 13],
    intent:
      "They answered some of the guided setup and stopped. Name the exact step they stopped on, say what finishing it unlocks, and link straight back to it.",
    avoid: "Do not restate steps they already completed. Do not imply they are behind.",
    channels: { email: true, waTemplate: null, waSlots: 0 },
  },
  {
    key: "built_not_published",
    label: "Funnel built, never published",
    days: [3, 13],
    intent:
      "The work is done and the switch is unflipped. Say so directly, name the funnel, and make publishing the only action in the message.",
    avoid: "Do not teach. They clearly know how it works; they stopped at the last inch.",
    channels: { email: true, waTemplate: "trial_publish", waSlots: 3 },
  },
  {
    key: "published_no_traffic",
    label: "Published, no responses yet",
    days: [4, 13],
    intent:
      "Live funnel, nobody in it. Offer the one thing that fixes that fastest, and make the 30 minute call the easy way to get it.",
    avoid: "Do not blame their traffic. Do not pitch ad spend.",
    channels: { email: true, waTemplate: null, waSlots: 0 },
  },
  {
    key: "first_response",
    label: "First response landed",
    days: [2, 14],
    intent:
      "Something real happened. Point at what their first respondent scored and what the funnel decided about them, and leave the useful half of the insight unsaid so the call is the way to get it.",
    avoid: "Do not give the full read. Do not congratulate at length.",
    channels: { email: true, waTemplate: "trial_first_lead", waSlots: 3 },
  },
  {
    key: "call_nudge",
    label: "Push the 30 minute call",
    days: [5, 12],
    intent:
      "They are using it and have not booked. Make the call concrete: what gets decided on it, how long it takes, and the link. One sentence of proof from their own data.",
    avoid: "Do not use the word demo. Do not offer a discount.",
    channels: { email: true, waTemplate: "trial_book_call", waSlots: 3 },
  },
  {
    key: "midpoint",
    label: "Day 7 - halfway",
    days: [7, 8],
    intent:
      "Half the trial is gone. State what they have built so far and what is still unproven, then ask for the call to close that gap.",
    avoid: "Do not use urgency language yet. Seven days is not an emergency.",
    channels: { email: true, waTemplate: null, waSlots: 0 },
  },
  {
    key: "closing_days",
    label: "Days 12 to 13 - running out",
    days: [12, 13],
    intent:
      "Say the date the trial ends, in DD-MM-YYYY. Say exactly what happens to their work when it does: nothing is deleted, the workspace goes read-only. Then the call link.",
    avoid:
      "Do not threaten and do not invent scarcity. The honest fact is sharp enough on its own.",
    channels: { email: true, waTemplate: "trial_ending", waSlots: 3 },
  },
  {
    key: "last_day",
    label: "Day 14 - last day",
    days: [14, 14],
    intent:
      "Last day. One short message, the end date, the one-line reassurance that their funnels and data are kept, and the two ways forward: subscribe, or take the call.",
    avoid: "Do not send a long message. Do not re-explain the product on the last day.",
    channels: { email: true, waTemplate: null, waSlots: 0 },
  },
  {
    key: "booked_prep",
    label: "Call booked, prepare them",
    days: [1, 14],
    intent:
      "They booked. Confirm the slot in DD-MM-YYYY HH:MM IST, say the one thing to have ready, and stop.",
    avoid: "Do not sell. The selling already worked.",
    channels: { email: true, waTemplate: null, waSlots: 0 },
  },
  {
    key: "no_show",
    label: "Missed the call",
    days: [1, 14],
    intent:
      "They did not turn up. No reproach at all: one line offering the rebooking link and the days left.",
    avoid:
      "Do not ask why they missed it, and never send this twice.",
    channels: { email: true, waTemplate: null, waSlots: 0 },
  },
];

const BY_KEY = new Map(LIFECYCLE_STAGES.map((s) => [s.key, s]));

export function isLifecycleStageKey(value: string): boolean {
  return BY_KEY.has(value);
}

export function lifecycleStage(key: string): LifecycleStage | null {
  return BY_KEY.get(key) ?? null;
}

/** Every stage reachable on this trial day. What the model is allowed to choose from. */
export function stagesForDay(day: number): LifecycleStage[] {
  return LIFECYCLE_STAGES.filter((s) => day >= s.days[0] && day <= s.days[1]);
}
