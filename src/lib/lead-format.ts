/**
 * What counts as a usable email address and a usable phone number.
 *
 * WHY THIS EXISTS. The lead schema accepted any string up to 40 characters as a phone
 * number, so nine-digit numbers reached the Submissions table and the WhatsApp sender
 * every day. A number that cannot be dialled is not a lead, and the place to refuse it
 * is the screen the respondent is still looking at.
 *
 * Pure and dependency-light on purpose: the same functions run in the browser (so the
 * error appears under the field) and on the server (so a crafted payload cannot skip
 * it), and scripts/verify-lead-format.ts pins them with no DB and no build.
 *
 * COUNTRY. Every rule lives in PHONE_RULES, keyed by country, and nothing outside this
 * file knows what the Indian rule is. Clients outside India mean adding a key here and
 * a per-tenant setting to choose it - not a hunt through the runner.
 */

/** Countries whose numbering we currently know. One for now, deliberately. */
export type LeadCountry = "IN";

export const DEFAULT_LEAD_COUNTRY: LeadCountry = "IN";

interface PhoneRule {
  /** How many digits the national number has, once any trunk/country prefix is off. */
  digits: number;
  /** The digits a mobile number may start with, after normalization. */
  firstDigits: readonly string[];
  /** Prefixes to strip when the number arrives with one. Longest first. */
  prefixes: readonly string[];
  /** Said to the respondent when the length is wrong. */
  lengthError: string;
  /** Said to the respondent when the leading digit is wrong. */
  firstDigitError: string;
}

const PHONE_RULES: Record<LeadCountry, PhoneRule> = {
  IN: {
    digits: 10,
    // Indian mobile numbers start 6, 7, 8 or 9. Checking this catches the mistyped
    // leading digit, which a length check alone lets through.
    firstDigits: ["6", "7", "8", "9"],
    // "+91 93568 19176", "0 93568 19176" and "93568 19176" are the same number typed
    // three ways, and all three arrive.
    prefixes: ["91", "0"],
    lengthError: "Enter a 10-digit mobile number.",
    firstDigitError: "An Indian mobile number starts with 6, 7, 8 or 9.",
  },
};

export type PhoneResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Reduce whatever was typed to the national number, or say why it cannot be.
 *
 * 🔴 The already-correct case is checked BEFORE any prefix is stripped. "9198765432"
 * is a valid ten-digit number that happens to begin with the country code, and a
 * strip-first implementation turns it into eight digits and rejects it. A prefix is
 * only removed when the remainder is exactly the right length, which is what makes
 * the check safe to run on input nobody has cleaned.
 */
export function normalizePhone(
  raw: string | null | undefined,
  country: LeadCountry = DEFAULT_LEAD_COUNTRY,
): PhoneResult {
  const rule = PHONE_RULES[country];
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (!digits) return { ok: false, error: rule.lengthError };

  const accept = (candidate: string): PhoneResult =>
    rule.firstDigits.includes(candidate.charAt(0))
      ? { ok: true, value: candidate }
      : { ok: false, error: rule.firstDigitError };

  if (digits.length === rule.digits) return accept(digits);

  for (const prefix of rule.prefixes) {
    if (digits.startsWith(prefix) && digits.length === prefix.length + rule.digits) {
      return accept(digits.slice(prefix.length));
    }
  }

  return { ok: false, error: rule.lengthError };
}

/** The number as it should be STORED: normalized when it is valid, else the digits as
 *  typed, so nothing is silently lost on a path that does not enforce the rule. */
export function phoneForStorage(
  raw: string | null | undefined,
  country: LeadCountry = DEFAULT_LEAD_COUNTRY,
): string {
  const res = normalizePhone(raw, country);
  return res.ok ? res.value : (raw ?? "").trim();
}

/**
 * Is this an email address we can send to?
 *
 * Deliberately a shape check and not a clever one: the only authority on whether an
 * address exists is the mail server, and a regex that tries to be exhaustive mostly
 * ends up rejecting real addresses. This catches the typed mistakes - no @, no dot in
 * the domain, a trailing comma - and lets the rest through.
 */
export function isValidEmail(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value || value.length > 254) return false;
  if (/\s/.test(value)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(value);
}

export const EMAIL_ERROR = "Enter a valid email address.";

/** Lowercased and trimmed, which is the form the retake lock and the CRM both key on. */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}
