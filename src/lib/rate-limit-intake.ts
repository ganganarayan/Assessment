import { rateLimit } from "@/lib/rate-limit";

/**
 * Throttle for the public funnel's two metered moments: START (the opt-in) and
 * COMPLETE (the step that spends one of the tenant's monthly responses).
 *
 * 🟡 WHY THIS EXISTS. Nothing stopped a script from hammering a tenant's funnel. Every
 * completion increments the response meter, and once the cap is reached the
 * capture-but-lock rule hides the tenant's REAL leads behind the upgrade screen - so a
 * bot could cost a business its leads without ever touching its account.
 *
 * 🟡 WHY THE LIMITS ARE GENEROUS. Many Indian mobile users share one public IP through
 * carrier NAT, so a tight per-IP limit would refuse real people during an ad burst.
 * These numbers stop one source flooding one funnel and leave ordinary traffic alone:
 * a human takes minutes per assessment, so 60 from one IP into one funnel inside the
 * window is either a crowd behind one NAT (rare at that rate) or a machine.
 *
 * Keyed per IP AND per funnel, so a busy funnel cannot lock out a quiet one. An unknown
 * IP is never throttled: lumping every header-less request into one bucket would let a
 * single bot refuse them all. Per instance, like the rest of lib/rate-limit.
 */
export const INTAKE_LIMITS = {
  start: { limit: 60, windowMs: 10 * 60_000 },
  complete: { limit: 60, windowMs: 60 * 60_000 },
} as const;

export type IntakeKind = keyof typeof INTAKE_LIMITS;

export function intakeAllowed(kind: IntakeKind, ip: string | null | undefined, assessmentId: string): boolean {
  const addr = ip?.trim();
  if (!addr) return true;
  const { limit, windowMs } = INTAKE_LIMITS[kind];
  return rateLimit(`intake:${kind}:${assessmentId}:${addr}`, limit, windowMs);
}
