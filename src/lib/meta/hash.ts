import { createHash } from "crypto";

/**
 * Meta Conversions API requires PII to be SHA-256 hashed (lowercase hex) after
 * light normalization. These helpers are PURE (no env, no I/O) so they can be
 * unit-tested directly. They return null for empty/missing input so the caller
 * simply omits the field.
 */

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Email: trim + lowercase, then hash. */
export function hashEmail(email: string | null | undefined): string | null {
  const c = clean(email);
  return c ? sha256Hex(c.toLowerCase()) : null;
}

/**
 * Phone: strip every non-digit (spaces, +, dashes, parens), then hash. Meta
 * wants country code included and digits only; we hash whatever digits we have.
 */
export function hashPhone(phone: string | null | undefined): string | null {
  const c = clean(phone);
  if (!c) return null;
  const digits = c.replace(/\D+/g, "");
  return digits.length > 0 ? sha256Hex(digits) : null;
}

/** Name (first/last): trim + lowercase, then hash. */
export function hashName(name: string | null | undefined): string | null {
  const c = clean(name);
  return c ? sha256Hex(c.toLowerCase()) : null;
}
