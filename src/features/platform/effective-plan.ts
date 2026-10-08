import { entitledPlan, grantedPlan } from "@/lib/billing/plan-resolve";
import { PLAN_LABEL, TRIAL_PLAN, type PlanId } from "@/lib/billing/plans";
import { type Plan, type SubscriptionStatus } from "@prisma/client";

/**
 * What a tenant is ACTUALLY entitled to right now, for the platform console.
 *
 * 🔴 THE BUG THIS EXISTS TO KILL. The console's "Plan & access" column showed a
 * dropdown bound to `Tenant.plan`, and every self-serve signup reads GATE there - the
 * column's default, never written by signup, and documented as entitling nobody on its
 * own. Underneath it, in small grey type, sat the line that actually mattered: "Trial
 * to 21 Oct 2026". So a workspace on a full 14-day SIGNAL trial was displayed as a GATE
 * tenant, and the obvious reading - that the trial was provisioning the wrong plan -
 * was wrong. Nothing was mis-entitled. The screen was.
 *
 * The second half of the same bug was that the column re-derived the answer in JSX,
 * with its own copy of the resolver's precedence. Two implementations of one rule is
 * how they drift. This module is the one place the console asks, and it answers with
 * the SAME pure helpers `resolvePlan` uses (entitledPlan, grantedPlan, TRIAL_PLAN), in
 * the same order:
 *
 *   internal (unlimited)  >  paid subscription  >  manual grant  >  trial  >  parked
 *
 * It deliberately does NOT call `resolvePlan`: that is one query per tenant, and this
 * runs for every row of a list that already has the columns in hand.
 */

export type AccessSource = "unlimited" | "paid" | "grant" | "trial" | "parked";

export interface EffectiveAccess {
  /** The plan in force, or null when nothing rates this tenant (internal/parked). */
  planId: PlanId | null;
  /** What to print as the plan: "Signal", "Unlimited", "No plan". */
  planLabel: string;
  source: AccessSource;
  /** The one line explaining WHY, e.g. "Trial, 13 days left". */
  detail: string;
  /** When the current entitlement runs out (ISO), null when it does not. */
  until: string | null;
}

export interface AccessInput {
  unlimited: boolean;
  plan: string;
  planExpiresAt: string | null;
  trialEndsAt: string | null;
  subStatus: string | null;
  subPlan: string | null;
  subPeriodEnd: string | null;
}

/** Whole days from now until `iso`, rounded up, floored at 0. */
function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

const label = (id: PlanId | null): string => (id ? (PLAN_LABEL[id] ?? id) : "No plan");

export function effectiveAccess(t: AccessInput, now: Date = new Date()): EffectiveAccess {
  // An internal tenant the owner runs themselves. Checked first, exactly as the
  // resolver does, so a lapsed subscription can never appear to downgrade it.
  if (t.unlimited) {
    return { planId: null, planLabel: "Unlimited", source: "unlimited", detail: "Internal - never metered", until: null };
  }

  // A live subscription outranks everything below it.
  const subEntitled =
    t.subStatus && t.subPlan ? entitledPlan(t.subPlan as Plan, t.subStatus as SubscriptionStatus) : null;
  if (subEntitled) {
    return {
      planId: subEntitled,
      planLabel: label(subEntitled),
      source: "paid",
      detail: t.subStatus === "PAST_DUE" ? "Paid, payment overdue" : "Paid",
      until: t.subPeriodEnd,
    };
  }

  // A manual grant needs the DATE to exist. `plan` defaults to GATE on every row, so
  // honouring the column alone would entitle every parked workspace on the install -
  // which is the same confusion this module exists to clear up, from the other side.
  const granted = grantedPlan(t.plan as Plan, t.planExpiresAt ? new Date(t.planExpiresAt) : null, now);
  if (granted) {
    return {
      planId: granted,
      planLabel: label(granted),
      source: "grant",
      detail: "Granted by you",
      until: t.planExpiresAt,
    };
  }

  const trialing = !!t.trialEndsAt && new Date(t.trialEndsAt).getTime() > now.getTime();
  if (trialing) {
    const d = daysLeft(t.trialEndsAt);
    return {
      planId: TRIAL_PLAN,
      planLabel: label(TRIAL_PLAN),
      source: "trial",
      detail: `Trial, ${d} day${d === 1 ? "" : "s"} left`,
      until: t.trialEndsAt,
    };
  }

  return { planId: null, planLabel: "No plan", source: "parked", detail: "Parked - read only", until: null };
}
