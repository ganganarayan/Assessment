import "server-only";
import { resolvePlan } from "@/lib/billing/plan-resolve";

/**
 * PARKED — the state a tenant lands in when the trial ends and nothing was bought, or a
 * subscription lapsed.
 *
 * 🟢 The defining rule: parking NEVER deletes anything. Every submission, export and
 * report stays exactly where it was, and paying restores the account whole. That is the
 * difference between a pause someone comes back from and a loss they resent — and it is
 * also the honest reading of "your data stays", which the pricing page now promises in
 * writing.
 *
 * What parking actually stops:
 *   - the public funnel accepts nothing new (a paused page, NOT a 404 — a 404 breaks
 *     live ad traffic and reads as an outage rather than a billing state)
 *   - the workspace becomes read-only: no edits, no publishing, no new scorecards
 *
 * What it does not stop: reading, exporting, and paying.
 */
export interface ParkedState {
  parked: boolean;
  /** Inside the trial — not parked, but worth surfacing so the end is never a surprise. */
  trialing: boolean;
}

/** Is this tenant parked? The platform and unlimited/internal tenants never are. */
export async function tenantParked(tenantId: string | null): Promise<ParkedState> {
  const { parked, trialing } = await resolvePlan(tenantId);
  return { parked, trialing };
}

/**
 * For a mutation action: the error to return when the workspace is parked, else null.
 * Mirrors scopeEditDenied (view-only staff) so callers treat both the same way — the
 * reason differs, the handling does not.
 */
export async function parkedDenied(
  tenantId: string | null,
): Promise<{ ok: false; error: string } | null> {
  const { parked } = await tenantParked(tenantId);
  return parked
    ? {
        ok: false,
        error:
          "Your trial has ended, so this workspace is read-only. Everything you built is still here — choose a plan to start collecting again.",
      }
    : null;
}
