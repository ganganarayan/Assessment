import { WORKFLOW_PLACEHOLDERS } from "@/features/workflows/types";

/**
 * CUSTOM VALUES: the half with no database in it.
 *
 * 🔴 ITS OWN MODULE because the contacts screen is a client component and needs
 * keyFromLabel to show somebody the placeholder their name will produce BEFORE they
 * create it. Importing that from the module that talks to Prisma pulled the database
 * client into the browser bundle - caught by verify:client-bundle, which is exactly
 * what that gate is for. The same split as lib/billing/plans.ts beside plan-resolve.
 *
 * lib/contacts/fields.ts re-exports all of this, so a server caller has one import.
 */

/**
 * 🔴 NAMES THE APP ALREADY OWNS, REFUSED AT CREATION RATHER THAN AT SEND TIME.
 *
 * fillPlaceholders builds its map from the lead first and then lets the call site's
 * extras overwrite it, so a field called firstName would not fail - it would silently
 * win or silently lose depending on which path the message took, and the workspace
 * would have redefined every message they had already written. Refusing the name is
 * the only answer that cannot surprise anybody later.
 *
 * meetingLink is in here too, and it is the one the app writes itself: see
 * SYSTEM_FIELDS.
 */
export const RESERVED_PLACEHOLDERS: readonly string[] = [
  ...WORKFLOW_PLACEHOLDERS,
  "resultUrl",
  "meetingLink",
  // The appointment placeholders a calendar automation fills from the booking itself.
  "appointmentTime",
  "appointmentDate",
  "bookingName",
];

/**
 * The fields the APP writes rather than a person.
 *
 * Created on demand rather than seeded for every workspace, because a workspace that
 * never connects Zoom should not carry a field it can neither fill nor delete. Its key
 * and label are fixed and it cannot be removed, since a sequence somewhere is already
 * saying {{meetingLink}} and a workspace is not expected to know that.
 */
export const SYSTEM_FIELDS: readonly { key: string; label: string; holdWhenEmpty: boolean }[] = [
  {
    key: "meetingLink",
    label: "Meeting link",
    // 🔴 A message that says "join here:" with nothing after it is worse than a message
    // that did not go out, which is why this one holds by default.
    holdWhenEmpty: true,
  },
];

/**
 * The placeholder key for a name somebody typed: "Plan name" becomes planName.
 *
 * One box on screen rather than two, because a workspace naming a value does not want
 * to be asked for a label AND a variable name - they want to type "Plan name" and be
 * shown {{planName}}. Derived rather than stored twice, so the two can never disagree.
 */
export function keyFromLabel(label: string): string {
  const words = label
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  const [first, ...rest] = words;
  const head = (first ?? "").toLowerCase();
  const key = head + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
  // A name starting with a digit cannot be a placeholder, and silently prefixing it
  // would hand back a key nobody typed. Left invalid for keyProblem to explain.
  return key.slice(0, 40);
}

const KEY_SHAPE = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

/** Why this key cannot be used, or null when it can. */
export function keyProblem(key: string): string | null {
  const k = key.trim();
  if (!k) return "Give the value a name.";
  if (!KEY_SHAPE.test(k)) {
    return "A name starts with a letter and uses only letters, numbers and underscores, up to 40 characters.";
  }
  if (RESERVED_PLACEHOLDERS.includes(k)) {
    return `${k} is one of the built-in placeholders, so it cannot be redefined. Pick another name.`;
  }
  return null;
}

export interface ResolvedValues {
  /** key -> value, for the ones that have one. Ready to merge into fillPlaceholders. */
  values: Record<string, string>;
  /** Every key this workspace has declared that would hold a message when empty. */
  holdKeys: string[];
}

/** Every {{placeholder}} named in these strings. */
export function placeholdersUsed(parts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const part of parts) {
    for (const m of (part ?? "").matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
      const key = m[1];
      if (key) out.add(key);
    }
  }
  return [...out];
}

/**
 * The custom value this message needs and does not have, or null when it can go.
 *
 * Returns the KEY rather than a boolean so the log can name it. "Held: no meetingLink"
 * is something somebody can act on; "held" is something they open a ticket about.
 */
export function heldForMissingValue(
  parts: (string | null | undefined)[],
  resolved: ResolvedValues,
): string | null {
  for (const key of placeholdersUsed(parts)) {
    if (!resolved.holdKeys.includes(key)) continue;
    if (!(resolved.values[key] ?? "").trim()) return key;
  }
  return null;
}
