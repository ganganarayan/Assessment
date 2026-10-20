/**
 * THE RELEASE CATALOG - which features can be held back from customers, and what each
 * one owns.
 *
 * Pure and client-safe (no prisma, no server-only), the same contract as
 * lib/billing/plans.ts: the platform console renders from this list, the workspace nav
 * hides routes from it, and the server gates read their keys from it. One list means a
 * feature cannot be half-registered - a key with a toggle but no routes, or routes
 * nobody can switch.
 *
 * THIS IS NOT THE PLAN CATALOG. A plan feature answers "has this customer paid for
 * it"; a release key answers "has this been handed to customers at all". Both must pass,
 * and the release key is checked first, because an unreleased feature should not even
 * offer an upgrade.
 *
 * `defaultReleased` is the PANIC ANSWER: what to say when there is no row in
 * feature_release, or the read failed. It is false for everything, on purpose.
 *
 * 🔴 It used to be true for the features that were already live, so that a database
 * blip could not take a working feature away. That reasoning does not survive two
 * databases. The same seed runs on staging and on production, where "already live" is
 * simply not true - production had never shown calendar, automations or contacts to
 * anybody - so a default of true would have released three features to every customer
 * the moment production deployed. Worse, the fallback would then CONTRADICT the stored
 * row: a read failure on production would show a feature that the row says is held back.
 *
 * So the row is the truth and the default is the panic answer, and the panic answer is
 * "show nothing new". A failed switch read almost certainly means the database behind
 * the feature is unreachable too, which makes hiding it the honest outcome rather than
 * a loss, and it is the behaviour the WhatsApp gate always had.
 */

export const FEATURE_RELEASE_KEYS = [
  "whatsapp",
  "automations",
  "workflows",
  "calendar",
  "contacts",
  "broadcasts",
] as const;

export type FeatureReleaseKey = (typeof FEATURE_RELEASE_KEYS)[number];

export interface ReleasableFeature {
  key: FeatureReleaseKey;
  /** What the owner sees on the switch. */
  label: string;
  /** One line on what customers get when it is on. */
  blurb: string;
  /**
   * What happens to customers while it is OFF, stated plainly - the thing the owner
   * actually needs to know before flipping it back.
   */
  whileHeld: string;
  defaultReleased: boolean;
  /**
   * The /w routes this feature owns. Held back = these disappear from the nav and
   * redirect. Order matters only for readability.
   *
   * PUBLIC routes are deliberately absent. A respondent's booking link or funnel is
   * already out there in somebody's ad or email, and a release switch pulling it down
   * would break the campaign of a tenant who did nothing wrong. Holding a feature back
   * takes away the OWNER-FACING surface and stops new sending; it never breaks a link a
   * customer has already published.
   */
  routes: string[];
}

export const RELEASABLE_FEATURES: readonly ReleasableFeature[] = [
  {
    key: "whatsapp",
    label: "WhatsApp (WABA)",
    blurb: "Connect a WhatsApp Business number and send approved templates.",
    whileHeld:
      "The connect card is hidden, connecting is refused, and WhatsApp steps in nurture, automations and workflows are skipped and logged. Stored numbers and templates are untouched.",
    // The Meta app still needs Tech Provider approval, so a customer who connected
    // would hit a wall that is not theirs to fix.
    defaultReleased: false,
    routes: [],
  },
  {
    key: "automations",
    label: "Automations",
    blurb: "A trigger and the messages it sends - confirmations, reminders, follow-ups.",
    whileHeld:
      "The menu item and page go, saving is refused, and queued runs wait instead of sending. Releasing is a clean start, not a catch-up: a run more than six hours past its send time is skipped, so nobody is reminded about a call that already happened.",
    defaultReleased: false,
    routes: ["/w/automations"],
  },
  {
    key: "workflows",
    label: "Workflow sequences",
    blurb: "Multi-step sequences with delays, tags and per-step suppression.",
    whileHeld:
      "Nothing new is queued and the queue is not drained. Runs already waiting stay where they are and resume on release, so a long hold can deliver a few of their steps close together.",
    // The engine shipped before its screens. Held back until there is something to look at.
    defaultReleased: false,
    routes: ["/w/workflows"],
  },
  {
    key: "calendar",
    label: "Appointment calendar",
    blurb: "One-to-one booking, availability, attendance and the calendar feed.",
    whileHeld:
      "The menu items and pages go and editing is refused. Booking links already published keep working - pulling those down would break a live campaign.",
    defaultReleased: false,
    routes: ["/w/calendar", "/w/calendar/availability"],
  },
  {
    key: "contacts",
    label: "Contacts",
    blurb: "One row per person, with tags and the way out (unsubscribe).",
    whileHeld:
      "The menu item and page go and editing is refused. Contacts keep being created behind the scenes, and unsubscribe keeps working - consent is never held back.",
    defaultReleased: false,
    routes: ["/w/contacts"],
  },
  {
    key: "broadcasts",
    label: "Broadcasts",
    blurb: "One message to a filtered audience, scheduled and sent at a throttled rate.",
    whileHeld:
      "The menu item and page go, nothing is scheduled, and a broadcast already sending stops being drained - the rows it has not reached stay PENDING rather than being lost.",
    // Its own key and not folded into workflows: a sequence that reaches one person at
    // a time and a blast that reaches five thousand at once carry very different risk,
    // and the owner has to be able to release one without the other.
    defaultReleased: false,
    routes: ["/w/broadcasts"],
  },
];

const BY_KEY: Record<FeatureReleaseKey, ReleasableFeature> = RELEASABLE_FEATURES.reduce(
  (acc, f) => {
    acc[f.key] = f;
    return acc;
  },
  {} as Record<FeatureReleaseKey, ReleasableFeature>,
);

export function isFeatureReleaseKey(value: string): value is FeatureReleaseKey {
  return (FEATURE_RELEASE_KEYS as readonly string[]).includes(value);
}

export function releasableFeature(key: FeatureReleaseKey): ReleasableFeature {
  return BY_KEY[key];
}

/** The answer to use when there is no row, or the row could not be read. */
export function defaultReleased(key: FeatureReleaseKey): boolean {
  return BY_KEY[key].defaultReleased;
}

/**
 * Every /w route owned by the features NOT in `allowed`. This is what the workspace
 * nav hides - derived from the catalog rather than listed again beside it, so a new
 * feature cannot be switchable and still leave its link in the menu.
 */
export function routesHeldBack(allowed: ReadonlySet<string>): string[] {
  return RELEASABLE_FEATURES.filter((f) => !allowed.has(f.key)).flatMap((f) => f.routes);
}

/**
 * One catalog entry plus the state of its switch, as the platform console shows it.
 *
 * `releasedAt` arrives PRE-FORMATTED (DD-MM-YYYY HH:MM, IST) rather than as a Date:
 * the card is a client component, and a date formatted in the browser is formatted in
 * the browser's locale - which is how a screen ends up reading 10-20-2026 to nobody's
 * benefit. Formatting it on the server through the project's own formatter is the rule.
 */
export interface FeatureReleaseStatus extends ReleasableFeature {
  released: boolean;
  /** When it was last switched on, DD-MM-YYYY HH:MM IST. Null = never released. */
  releasedAt: string | null;
  note: string | null;
  /** Who last flipped it, by name or email. Null when unknown or seeded by migration. */
  changedBy: string | null;
}
