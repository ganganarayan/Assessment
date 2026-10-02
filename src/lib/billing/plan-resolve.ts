import { type Plan, type Subscription, type SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  PLAN_LIMITS,
  UNLIMITED_LIMITS,
  applyOverrides,
  hasFeature,
  parseLimitsSnapshot,
  type Feature,
  type PlanId,
  type PlanLimits,
  TRIAL_PLAN,
  PARKED_LIMITS,
  trialDaysLeft,
} from "@/lib/billing/plans";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";

/**
 * Plan + entitlement resolution, split out of entitlements.ts so it can run
 * OUTSIDE Next.js.
 *
 * Why the split: entitlements.ts is `server-only`, a package that does not
 * resolve under plain Node — so anything importing it cannot run in the Railway
 * cron (`tsx scripts/sweep-abandoned.ts`). The cron needs the feature gate,
 * because a sweep decides whether a tenant may send Conversions API events, and
 * a Free tenant must not.
 *
 * entitlements.ts re-exports everything here, so every existing caller is
 * unchanged and there is exactly one implementation of the rules.
 */

/**
 * The plan a subscription actually ENTITLES to, given its status. A canceled/halted
 * subscription (lapsed) or a still-pending one (never paid) falls back to FREE;
 * PAST_DUE keeps the plan (dunning grace). Pure, centralized so Phase 4 reuses it.
 */
export function entitledPlan(plan: Plan, status: SubscriptionStatus): PlanId | null {
  // null = PARKED. There is no free tier to fall back to any more, and silently
  // downgrading a lapsed customer to the cheapest paid plan would be worse than parking:
  // their scorecards would keep collecting on a plan they never chose, and the first
  // sign would be a bill or a feature that stopped working with no explanation.
  if (status === "CANCELED" || status === "HALTED" || status === "PENDING") return null;
  return plan as PlanId;
}

export interface ResolvedPlan {
  /** null = not rated against the catalog at all — the platform, or an internal tenant. */
  plan: PlanId | null;
  status: SubscriptionStatus | null;
  limits: PlanLimits;
  isPlatform: boolean;
  /** Inside the 14-day Signal trial — full Signal entitlements, nothing paid yet. */
  trialing: boolean;
  /**
   * Whole days left in the trial (ceiling), 0 when not trialing. Resolved here rather
   * than at each caller because the trialEndsAt column is already in this query and a
   * banner that disagrees with the billing page about "3 days" is worse than no banner.
   */
  trialDaysLeft: number;
  /**
   * PARKED: no plan, no trial left. Read-only — the funnel is paused and nothing new is
   * accepted, but every existing submission, export and report stays visible and NOTHING
   * is deleted. Parking is reversible by paying; deletion would not be.
   */
  parked: boolean;
  /**
   * The response limit the READ path compares an ALREADY-STORED `periodSeq` against —
   * the result page, /api/r, the leads list and the export. Equal to
   * `limits.responsesPerMonth` in every state but one.
   *
   * 🔴 Why it has to be separate when parked. `PARKED_LIMITS.responsesPerMonth` is 0,
   * and `isResponseLocked` locks any seq above the limit — so reading the parked limit
   * on the read path locks EVERY lead the tenant ever captured. The workspace goes
   * blank, the exports empty out, and the promise parking is built on ("nothing is
   * deleted, everything stays visible") becomes false at the one moment the tenant is
   * deciding whether to trust us with a card.
   *
   * It is not simply "unlimited when parked" either: a tenant 50 leads over their cap
   * could then unlock those 50 by CANCELLING, which prices the overage at zero and
   * rewards churn. So parking freezes the read limit at the last plan that entitled
   * them — the subscription's own snapshot, or the trial's allowance for a lapsed trial.
   * Leads they had earned stay readable; leads they had not stay locked.
   */
  readResponseLimit: number | null;
  /**
   * True when this scope is unmetered and un-gated: the platform itself, or a tenant the
   * owner flagged INTERNAL on /platform. `plan: null` alone does not say which, and every
   * caller that wrote `plan ?? "FREE"` therefore displayed and treated an unlimited tenant
   * as Free — the opposite of what the flag means. Read this instead of inferring.
   */
  unlimited: boolean;
}

/**
 * The response allowance a PARKED tenant's already-stored leads are judged against:
 * whatever the lapsed subscription was frozen at (with its overrides), else the trial's.
 *
 * Reads the snapshot regardless of the subscription's status, which is the whole point —
 * `entitledPlan` has already decided the status entitles nothing, and this is asking a
 * different question: what were they entitled to WHEN THEY CAPTURED these leads.
 */
function lastEntitledResponseLimit(sub: Subscription | null): number | null {
  if (!sub) return PLAN_LIMITS[TRIAL_PLAN].responsesPerMonth;
  const base = parseLimitsSnapshot(sub.limitsSnapshot, sub.plan as PlanId);
  const withOverrides = sub.limitOverrides != null ? applyOverrides(base, sub.limitOverrides) : base;
  return withOverrides.responsesPerMonth;
}

/**
 * Resolve a tenant's effective plan + limits. Order of precedence for limits:
 * per-tenant overrides > frozen snapshot (subscription) > code default (PLAN_LIMITS).
 * Never throws — a corrupt snapshot degrades to the catalog value.
 */
export async function resolvePlan(tenantId: string | null): Promise<ResolvedPlan> {
  // The platform is never rated against a plan — not even the SCALE value its Tenant
  // row carries. Short-circuiting here (rather than reading the row) keeps the owner's
  // own funnel unmetered and un-gateable no matter what the column says, and means the
  // hot path costs a string compare instead of a query.
  if (!isBusinessTenant(tenantId)) {
    return { plan: null, status: null, limits: UNLIMITED_LIMITS, isPlatform: true, unlimited: true, trialing: false, trialDaysLeft: 0, parked: false, readResponseLimit: null };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, subscription: true, unlimited: true, trialEndsAt: true },
  });

  // Unknown tenant → parked. Safest: a gate denies extras, never a respondent already
  // mid-assessment, and an id with no row is a bug rather than a customer to serve.
  if (!tenant) {
    return {
      plan: null,
      status: null,
      limits: PARKED_LIMITS,
      isPlatform: false,
      unlimited: false,
      trialing: false,
      trialDaysLeft: 0,
      parked: true,
      // An id with no row owns no submissions, so there is nothing to keep readable.
      readResponseLimit: 0,
    };
  }

  // An INTERNAL tenant the owner runs themselves: unlimited and un-gated, like the
  // platform. Checked before the subscription so a lapsed or absent subscription can
  // never quietly drop it to FREE — which would take Meta CAPI down on a tenant that
  // is spending on ads, with nothing surfacing the change.
  if (tenant.unlimited) {
    return { plan: null, status: null, limits: UNLIMITED_LIMITS, isPlatform: false, unlimited: true, trialing: false, trialDaysLeft: 0, parked: false, readResponseLimit: null };
  }

  const sub = tenant.subscription;
  const effective = sub ? entitledPlan(sub.plan, sub.status) : null;

  // No entitling subscription: the trial decides. Inside it, full Signal — the trial has
  // to show the mechanism, not a crippled version of it. Outside it, parked.
  if (effective === null) {
    const trialing = tenant.trialEndsAt != null && tenant.trialEndsAt.getTime() > Date.now();
    return {
      plan: trialing ? TRIAL_PLAN : null,
      status: sub?.status ?? null,
      limits: trialing ? PLAN_LIMITS[TRIAL_PLAN] : PARKED_LIMITS,
      isPlatform: false,
      unlimited: false,
      trialing,
      trialDaysLeft: trialing ? trialDaysLeft(tenant.trialEndsAt) : 0,
      parked: !trialing,
      // Parked: freeze the read limit at the last plan that entitled them — the lapsed
      // subscription's own frozen snapshot, or (no subscription at all) the trial's
      // allowance, since the trial is what let them collect in the first place.
      readResponseLimit: trialing
        ? PLAN_LIMITS[TRIAL_PLAN].responsesPerMonth
        : lastEntitledResponseLimit(sub),
    };
  }

  const base = sub ? parseLimitsSnapshot(sub.limitsSnapshot, effective) : PLAN_LIMITS[effective];
  const limits = sub?.limitOverrides != null ? applyOverrides(base, sub.limitOverrides) : base;

  return {
    plan: effective,
    status: sub?.status ?? null,
    limits,
    isPlatform: false,
    unlimited: false,
    trialing: false,
    trialDaysLeft: 0,
    parked: false,
    readResponseLimit: limits.responsesPerMonth,
  };
}

/** Whether a tenant is entitled to a feature. The platform's own scope → always true. */
export async function tenantCan(tenantId: string | null, feature: Feature): Promise<boolean> {
  const { limits } = await resolvePlan(tenantId);
  return hasFeature(limits, feature);
}
