/**
 * Per-assessment selection of which Meta events an assessment reports.
 *
 * `Assessment.fireMetaCapi` stays the master switch - off means this assessment tells
 * Meta nothing, which is what keeps a routed (non ad-entry) assessment from polluting
 * the ad account's learning. `metaEvents` then narrows WHICH events fire when the
 * master is on.
 *
 * Absent/null means every event is on, so an assessment saved before this existed
 * behaves exactly as it did. That matters more than it looks: these events feed live ad
 * audiences, and a migration that defaulted them off would quietly stop populating
 * audiences on funnels that are currently spending.
 *
 * PURCHASE IS DELIBERATELY NOT HERE.
 * It fires from the Razorpay webhook, which records every captured payment stamped with
 * the webhook's tenant and often has no matching submission at all (external payments).
 * There is no assessment in scope to read a flag from, so offering a per-assessment
 * Purchase toggle would be a control that silently did nothing for some payments. It
 * stays tenant-level.
 */

/** The assessment-driven events that can be selected individually. */
export const META_EVENT_KEYS = [
  "registration",
  "completion",
  "gateDisqualified",
  "abandoned",
  "gateIncomplete",
] as const;

export type MetaEventKey = (typeof META_EVENT_KEYS)[number];

export type MetaEventFlags = Record<MetaEventKey, boolean>;

/** Everything on - the default, and what a null column means. */
export const ALL_META_EVENTS: MetaEventFlags = {
  registration: true,
  completion: true,
  gateDisqualified: true,
  abandoned: true,
  gateIncomplete: false,
};

/**
 * Events that are OFF until the owner asks for them.
 *
 * The rule below - a missing key means on - exists so that funnels saved before an
 * event existed keep populating the audiences they already feed. For a BRAND NEW event
 * name that is exactly wrong: no audience can depend on it yet, and defaulting it on
 * would start sending a new event from every funnel on the platform, including other
 * tenants' live ones, without anybody choosing it.
 */
const DEFAULT_OFF = new Set<MetaEventKey>(["gateIncomplete"]);

/** Labels and the "why you might turn this off" for the builder. */
export const META_EVENT_META: Record<MetaEventKey, { label: string; event: string; help: string }> = {
  registration: {
    label: "Opt-in",
    event: "CompleteRegistration",
    help: "Fires when someone submits the opt-in form. This is the signal most lead campaigns optimise towards.",
  },
  completion: {
    label: "Completion",
    event: "AssessmentCompleted / QualifiedCompletion",
    help: "Fires when the assessment is finished. Gated funnels send QualifiedCompletion instead, so the audience only contains people who passed.",
  },
  gateDisqualified: {
    label: "Disqualified",
    event: "GateDisqualified",
    help: "Fires when the page-1 gate rejects someone. Its only purpose is an exclusion audience - turn it off and you lose the ability to stop paying for unfit traffic.",
  },
  abandoned: {
    label: "Left the opt-in",
    event: "AssessmentAbandoned",
    help: "Fires ten minutes after someone who passed the gate reached the opt-in form and left without opting in. They saw the ask and refused it, so they are worth showing the ad again.",
  },
  gateIncomplete: {
    label: "Never reached the opt-in",
    event: "GateIncomplete",
    help: "Fires ten minutes after someone passed the gate but never got as far as the opt-in form. They never saw the ask, so they are a different audience from the one above. Off until you turn it on.",
  },
};

/** Read the stored column, treating anything unrecognised as "on". */
export function readMetaEvents(value: unknown): MetaEventFlags {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...ALL_META_EVENTS };
  const v = value as Record<string, unknown>;
  const out = { ...ALL_META_EVENTS };
  for (const k of META_EVENT_KEYS) {
    // An explicit boolean always wins, either way.
    //
    // Reading `true` back used to be impossible for a DEFAULT_OFF event: the result
    // started from ALL_META_EVENTS, where those keys are false, and nothing ever set
    // one to true again. So the box could be ticked and saved and still came back
    // unticked, over and over, with the stored value sitting there saying true.
    if (v[k] === false) out[k] = false;
    else if (v[k] === true) out[k] = true;
    // No stored value: an established event stays ON, so a partial or hand-edited
    // object can never silently mute one that is feeding a live audience. A brand new
    // event stays OFF, because nothing can depend on it yet and switching it on for
    // every funnel at once is not ours to do.
    else if (DEFAULT_OFF.has(k)) out[k] = false;
  }
  return out;
}

/**
 * Should this assessment fire this event? The master switch AND the per-event flag.
 *
 * Every CAPI fire site for an assessment-driven event goes through this, so the two
 * conditions cannot drift apart at one call site.
 */
export function metaEventOn(
  fireMetaCapi: boolean,
  metaEvents: unknown,
  key: MetaEventKey,
): boolean {
  return fireMetaCapi && readMetaEvents(metaEvents)[key];
}
