/**
 * Where a contact came from, and which of those origins carry no consent.
 *
 * A PLAIN module, so the audience query, the contacts screen and the broadcast editor
 * all read the same list. One definition, because the day they disagree is the day a
 * screen says "these people are excluded" while the sender writes them in anyway.
 */

/** Captured by this app, from somebody who filled something in. */
export const SOURCE_SUBMISSION = "SUBMISSION";
export const SOURCE_SPLIT_GATE = "SPLIT_GATE";
export const SOURCE_ADMIN = "ADMIN";

/** Arrived off a connected phone during coexistence onboarding. */
export const SOURCE_WHATSAPP_IMPORT = "WHATSAPP_IMPORT";
export const SOURCE_WHATSAPP_CHAT = "WHATSAPP_CHAT";

/**
 * 🔴 The origins that never gave marketing consent.
 *
 * A name in somebody's phone address book agreed to nothing, and somebody who once
 * messaged a shop agreed to nothing either. Broadcasts exclude these unless the sender
 * deliberately includes them, and the cost of getting it wrong is not embarrassment:
 * unsolicited templates are what drop a WhatsApp number's quality rating and then its
 * sending tier, so an address book treated as a list costs the number itself.
 */
export const UNCONSENTED_SOURCES: string[] = [SOURCE_WHATSAPP_IMPORT, SOURCE_WHATSAPP_CHAT];

/** For a screen that wants to say where somebody came from in words. */
export function describeSource(source: string | null | undefined): string {
  switch (source) {
    case SOURCE_SUBMISSION:
      return "Took an assessment";
    case SOURCE_SPLIT_GATE:
      return "Started an assessment";
    case SOURCE_ADMIN:
      return "Added by hand";
    case SOURCE_WHATSAPP_IMPORT:
      return "From your phone contacts";
    case SOURCE_WHATSAPP_CHAT:
      return "Messaged you on WhatsApp";
    default:
      return "Unknown";
  }
}

/** Did this person opt in, or are they only here because a phone was connected? */
export function isUnconsentedSource(source: string | null | undefined): boolean {
  return source ? UNCONSENTED_SOURCES.includes(source) : false;
}
