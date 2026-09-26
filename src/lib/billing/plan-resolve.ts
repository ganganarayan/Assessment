import { type Plan, type SubscriptionStatus } from "@prisma/client";
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
} from "@/lib/billing/plans";

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
export function entitledPlan(plan: Plan, status: SubscriptionStatus): PlanId {
  if (status === "CANCELED" || status === "HALTED" || status === "PENDING") return "FREE";
  return plan as PlanId;
}

export interface ResolvedPlan {
  /** null = platform/Gita scope (unlimited). */
  plan: PlanId | null;
  status: SubscriptionStatus | null;
  limits: PlanLimits;
  isPlatform: boolean;
}

/**
 * Resolve a tenant's effective plan + limits. Order of precedence for limits:
 * per-tenant overrides > frozen snapshot (subscription) > code default (PLAN_LIMITS).
 * Never throws — a corrupt snapshot degrades to the catalog value.
 */
export async function resolvePlan(tenantId: string | null): Promise<ResolvedPlan> {
  if (tenantId === null) {
    return { plan: null, status: null, limits: UNLIMITED_LIMITS, isPlatform: true };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, subscription: true },
  });

  // Unknown tenant → treat as Free (safest; a gate would deny extras, never a respondent).
  if (!tenant) {
    return { plan: "FREE", status: null, limits: PLAN_LIMITS.FREE, isPlatform: false };
  }

  const sub = tenant.subscription;
  const effective = sub ? entitledPlan(sub.plan, sub.status) : (tenant.plan as PlanId);

  // If the subscription lapsed to FREE, use the FREE catalog (not the paid snapshot).
  const base =
    sub && effective !== "FREE"
      ? parseLimitsSnapshot(sub.limitsSnapshot, effective)
      : PLAN_LIMITS[effective];

  const limits = sub?.limitOverrides != null ? applyOverrides(base, sub.limitOverrides) : base;

  return { plan: effective, status: sub?.status ?? null, limits, isPlatform: false };
}

/** Whether a tenant is entitled to a feature. Platform scope → always true. */
export async function tenantCan(tenantId: string | null, feature: Feature): Promise<boolean> {
  const { limits } = await resolvePlan(tenantId);
  return hasFeature(limits, feature);
}
