import { type LifecycleFacts } from "@/lib/lifecycle/facts";
import { lifecycleStage, stagesForDay } from "@/lib/lifecycle/stages";

/**
 * THE ROUTER - decides without the model whenever the answer is obvious.
 *
 * 🟢 This is the single biggest cost lever in the engine, and the reason the daily
 * bill is measured in cents. Most people on most days are not an interesting judgement
 * call: day 3 with zero logins has exactly one sensible stage, and paying a model to
 * rediscover that every morning for a fortnight is paying for nothing. Only the rows
 * where the right move is genuinely ambiguous reach the AI.
 *
 * It also does the job the model must never be trusted with: the STOPS. Suppression,
 * frequency caps and "they already got this one" are arithmetic, and arithmetic does
 * not have an off day. The model is asked what to say, never whether to say anything.
 *
 * Returns one of three things:
 *   - a decided stage, with the reason, and no AI call
 *   - SKIP, with the reason, and no AI call
 *   - the shortlist of stages that fit, for the model to choose between
 */

export type RouterOutcome =
  | { kind: "decided"; stageKey: string; reason: string }
  | { kind: "skip"; reason: string }
  | { kind: "ask"; candidates: string[]; reason: string };

/**
 * 🔴 THE CAPS. Not configurable, on purpose: a number somebody can raise in a hurry is
 * a number that gets raised in a hurry, and the failure mode here is a person being
 * messaged daily by a machine until they report us.
 */
export const CAPS = {
  /** Nothing at all within this many days of the last message, whatever the stage. */
  minDaysBetweenMessages: 1,
  /** A stage that nudges rather than informs cannot repeat inside this many days. */
  minDaysBetweenNudges: 3,
  /** The sequence stops here however much trial is left. */
  maxTrialDay: 14,
} as const;

/** Stages that may only ever be sent once to one person. */
const ONCE_ONLY = new Set(["welcome", "midpoint", "last_day", "booked_prep", "no_show", "first_response"]);

/** Stages that are a nudge rather than news, and so are rate limited harder. */
const NUDGES = new Set(["no_login", "resume_onboarding", "built_not_published", "published_no_traffic", "call_nudge"]);

export function route(facts: LifecycleFacts): RouterOutcome {
  const { trialDay, history } = facts;

  // --- The stops, in the order they actually bite ---------------------------

  if (trialDay < 1) return { kind: "skip", reason: "Anchor is in the future." };
  if (trialDay > CAPS.maxTrialDay) {
    return { kind: "skip", reason: `Past day ${CAPS.maxTrialDay}, the sequence is over.` };
  }
  if (history.daysSinceLastMessage !== null && history.daysSinceLastMessage < CAPS.minDaysBetweenMessages) {
    return { kind: "skip", reason: "Already heard from us inside the last day." };
  }

  const sent = new Set(history.stagesSent);
  const recentNudge =
    history.lastStage !== null &&
    NUDGES.has(history.lastStage) &&
    history.daysSinceLastMessage !== null &&
    history.daysSinceLastMessage < CAPS.minDaysBetweenNudges;

  /** Is this stage still available to this person today? */
  const open = (key: string): boolean => {
    if (ONCE_ONLY.has(key) && sent.has(key)) return false;
    if (NUDGES.has(key) && recentNudge) return false;
    return stagesForDay(trialDay).some((s) => s.key === key);
  };

  // --- The decided cases: one obvious answer, no model needed ---------------

  // Day one is day one. There is nothing to weigh up.
  if (trialDay === 1 && open("welcome")) {
    return { kind: "decided", stageKey: "welcome", reason: "Day 1, nothing sent yet." };
  }

  // A missed call outranks everything else that could be said today.
  if (facts.call.status === "NO_SHOW" && open("no_show")) {
    return { kind: "decided", stageKey: "no_show", reason: "Marked no-show on the booked call." };
  }

  // A booked call changes the job from selling to preparing.
  if (facts.call.status === "BOOKED" && open("booked_prep")) {
    return { kind: "decided", stageKey: "booked_prep", reason: "Call is booked and not yet held." };
  }

  // Never signed in is the clearest signal there is, and the copy barely varies.
  if (facts.logins.count === 0 && open("no_login")) {
    return { kind: "decided", stageKey: "no_login", reason: "Workspace created, never signed in." };
  }

  // The last day is the last day.
  if (trialDay === CAPS.maxTrialDay && open("last_day")) {
    return { kind: "decided", stageKey: "last_day", reason: "Final day of the trial." };
  }

  // --- Everything else is a judgement call ----------------------------------

  const candidates = stagesForDay(trialDay)
    .map((s) => s.key)
    .filter(open)
    // A no-show or prep stage only applies when the calendar says so, and the checks
    // above have already handled the cases where it does.
    .filter((k) => k !== "no_show" && k !== "booked_prep")
    // First response is only news if there IS one.
    .filter((k) => k !== "first_response" || facts.responses.total > 0)
    // Do not tell somebody to publish what they have not built.
    .filter((k) => k !== "built_not_published" || (facts.funnels.total > 0 && facts.funnels.published === 0))
    // Do not talk about traffic to a funnel that is not live.
    .filter((k) => k !== "published_no_traffic" || (facts.funnels.published > 0 && facts.responses.total === 0))
    // Onboarding only matters while some of it is left.
    .filter((k) => k !== "resume_onboarding" || facts.onboarding.answered < facts.onboarding.total);

  if (candidates.length === 0) {
    return { kind: "skip", reason: "Nothing left that fits today without repeating ourselves." };
  }
  // One survivor is not a judgement call either, whatever got it there.
  const only = candidates[0];
  if (candidates.length === 1 && only) {
    return { kind: "decided", stageKey: only, reason: "Only one stage fits today." };
  }
  return {
    kind: "ask",
    candidates,
    reason: `${candidates.length} stages fit day ${trialDay}.`,
  };
}

/** The shortlist as the model is shown it: key, intent and what to avoid. */
export function describeCandidates(keys: string[]): string {
  return keys
    .map((k) => {
      const s = lifecycleStage(k);
      if (!s) return null;
      return `- ${s.key}: ${s.intent}\n  AVOID: ${s.avoid}\n  WhatsApp: ${
        s.channels.waTemplate ? `${s.channels.waTemplate} (${s.channels.waSlots} short slots)` : "email only"
      }`;
    })
    .filter((v): v is string => v !== null)
    .join("\n");
}
