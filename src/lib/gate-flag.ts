/**
 * Client-side memory of a qualification-gate rejection.
 *
 * The lockout is deliberately permanent for as long as the flag survives: a rejected
 * visitor should not get back into the funnel, and the back button must not walk them
 * out of it (the funnel forces a reload on a bfcache restore so this is re-read). A
 * cleared cookie or a new device loses it, and nothing can be done about that - a
 * non-opt-in leaves no PII to match on. The real exclusion is the Meta custom audience
 * that GateDisqualified populates; this flag is the instant local layer in front of it.
 *
 * The flag now answers ONE question - is this visitor locked out? (any stored
 * rejection, forever). Whether GateDisqualified should fire is decided SERVER-side
 * from `capiFiredAt` on the visitor's gate_disqualification rows, because the event
 * moved to the Conversions API: a rejection carries no PII and needs none, and firing
 * server-side survives ad blockers and can be counted. The refresh interval below is
 * the rule that decision still uses - firing on every revisit (the original bug)
 * inflated Meta's count past the number of people rejected, while never re-firing
 * lets them age out of the exclusion audience and start seeing the ad again.
 *
 * shouldFireDisqualified / stampGateRejectionFired are kept as the pure, testable
 * statement of that rule (scripts/verify-gate-flag.ts).
 *
 * Pure + storage-agnostic, so it is unit-testable and safe on either side of render.
 */

/**
 * How long before GateDisqualified is sent again for a visitor who is still being
 * turned away. Comfortably inside Meta's 180-day website-event audience retention, so
 * membership is renewed before it lapses, while a returning visitor costs one event
 * every couple of months instead of one per visit.
 */
export const GATE_DQ_AUDIENCE_REFRESH_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/** A stored rejection. `at` is 0 for a legacy flag written before timestamps existed. */
export interface GateRejection {
  /** When the visitor was rejected (0 = unknown, legacy flag). */
  at: number;
  /** When GateDisqualified was last sent for this rejection; null = never. */
  firedAt: number | null;
}

/** localStorage key for one assessment's rejection (scoped per funnel). */
export function gateFlagKey(slug: string): string {
  return `gate_dq:${slug}`;
}

/**
 * The stored rejection, or null when there is none / it is unreadable.
 *
 * Never expires: a non-null result means locked out. A legacy `"1"` (written before
 * this carried any structure) is honoured as a real rejection with an unknown date and
 * no recorded send - so the visitor stays locked out, and the audience refresh below
 * will fire once for them, since there is no evidence Meta ever received their event.
 */
export function readGateRejection(raw: string | null | undefined): GateRejection | null {
  if (!raw) return null;
  if (raw === "1") return { at: 0, firedAt: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { at, firedAt } = parsed as { at?: unknown; firedAt?: unknown };
    if (typeof at !== "number" || !Number.isFinite(at)) return null;
    return {
      at,
      firedAt: typeof firedAt === "number" && Number.isFinite(firedAt) ? firedAt : null,
    };
  } catch {
    return null;
  }
}

/**
 * Whether GateDisqualified should be sent for this rejection now: when it has never
 * been sent, or when the last send is old enough that audience membership is worth
 * renewing. Everything in between is a revisit Meta already knows about.
 */
export function shouldFireDisqualified(rejection: GateRejection, now: number = Date.now()): boolean {
  if (rejection.firedAt === null) return true;
  return now - rejection.firedAt >= GATE_DQ_AUDIENCE_REFRESH_MS;
}

/** The value to store for a rejection happening now, not yet reported to Meta. */
export function writeGateRejection(now: number = Date.now()): string {
  return JSON.stringify({ at: now, firedAt: null } satisfies GateRejection);
}

/** The same rejection, stamped with the moment GateDisqualified was just sent. */
export function stampGateRejectionFired(rejection: GateRejection, now: number = Date.now()): string {
  return JSON.stringify({ at: rejection.at || now, firedAt: now } satisfies GateRejection);
}
