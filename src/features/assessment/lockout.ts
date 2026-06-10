/**
 * Pure retake-lockout helpers (no DB / no server-only) so the policy + identifier
 * logic is unit-testable. See scripts/verify-retake.ts.
 */
export type RetakePolicy = "DELAYED" | "NEVER" | "UNLIMITED";
export type UniqueIdentifier = "EMAIL" | "MOBILE";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normalize a respondent's identifier for dedup/lockout matching:
 *  - EMAIL  -> lowercased + trimmed
 *  - MOBILE -> digits only (strips spaces, +, -, leading country/zeros kept as digits)
 * Returns null when there is nothing usable (so callers never query on null).
 */
export function normalizeIdentifier(
  kind: UniqueIdentifier,
  lead: { email?: string | null; mobile?: string | null },
): string | null {
  if (kind === "MOBILE") {
    const digits = (lead.mobile ?? "").replace(/\D+/g, "");
    return digits.length > 0 ? digits : null;
  }
  const email = (lead.email ?? "").trim().toLowerCase();
  return email.length > 0 ? email : null;
}

export type LockoutVerdict =
  | { locked: false }
  | { locked: true; nextAvailableAt: Date | null }; // null = never (NEVER policy)

/**
 * Decide whether a new attempt is blocked, given the latest COMPLETED attempt.
 * Pure: `now` is injected. Date math is in UTC instants (no calendar drift).
 */
export function evaluateLockout(
  policy: RetakePolicy,
  retakeDays: number,
  lastCompletedAt: Date | null,
  now: Date,
): LockoutVerdict {
  if (policy === "UNLIMITED") return { locked: false };
  if (!lastCompletedAt) return { locked: false };
  if (policy === "NEVER") return { locked: true, nextAvailableAt: null };
  // DELAYED
  const nextAvailableAt = new Date(lastCompletedAt.getTime() + retakeDays * DAY_MS);
  return now.getTime() < nextAvailableAt.getTime()
    ? { locked: true, nextAvailableAt }
    : { locked: false };
}
