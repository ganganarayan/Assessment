import "server-only";
import { Prisma, type Plan, type SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  PLAN_LIMITS,
  UNLIMITED_LIMITS,
  applyOverrides,
  hasFeature,
  parseLimitsSnapshot,
  usageFraction,
  usagePeriodKey,
  type Feature,
  type PlanId,
  type PlanLimits,
} from "@/lib/billing/plans";

/**
 * Server-side entitlement + usage resolution for a tenant. Mirrors the shape of
 * settings/config.ts (resolveMetaConfig): a `tenantId` of null = the platform/Gita
 * scope, which is UNLIMITED and unmetered. Phase 1 only RESOLVES this — no gate
 * calls this yet (Phase 2 meters, Phase 4 enforces).
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

export interface UsageLine {
  used: number;
  /** null = unlimited. */
  limit: number | null;
  /** 0..>1; 0 when unlimited. */
  fraction: number;
}

export interface UsageSummary {
  plan: PlanId | null;
  isPlatform: boolean;
  responses: UsageLine;
  assessments: UsageLine;
  seats: UsageLine;
}

/**
 * Current usage vs limits for the meters UI (Phase 2 wires the RESPONSES counter;
 * in Phase 1 the counter is absent so responses.used reads 0). Assessments and
 * seats are COUNT()ed live — no counter table. Platform scope reports unlimited.
 */
export async function getUsage(tenantId: string | null, now: Date = new Date()): Promise<UsageSummary> {
  const resolved = await resolvePlan(tenantId);
  const { limits } = resolved;

  const line = (used: number, limit: number | null): UsageLine => ({
    used,
    limit,
    fraction: usageFraction(used, limit),
  });

  if (resolved.isPlatform) {
    return {
      plan: null,
      isPlatform: true,
      responses: line(0, null),
      assessments: line(0, null),
      seats: line(0, null),
    };
  }

  // Period start comes from the subscription (paid) or is null (Free → calendar month).
  const sub = await prisma.subscription.findUnique({
    where: { tenantId: tenantId as string },
    select: { currentPeriodStart: true },
  });
  const periodKey = usagePeriodKey(sub?.currentPeriodStart ?? null, now);

  const [responseCounter, assessmentCount, seatCount] = await Promise.all([
    prisma.usageCounter.findUnique({
      where: {
        tenantId_metric_periodKey: { tenantId: tenantId as string, metric: "RESPONSES", periodKey },
      },
      select: { count: true },
    }),
    prisma.assessment.count({ where: { tenantId: tenantId as string } }),
    prisma.user.count({ where: { tenantId: tenantId as string } }),
  ]);

  return {
    plan: resolved.plan,
    isPlatform: false,
    responses: line(responseCounter?.count ?? 0, limits.responsesPerMonth),
    assessments: line(assessmentCount, limits.maxAssessments),
    seats: line(seatCount, limits.seats),
  };
}

/**
 * Build the frozen limits snapshot to store on a Subscription at purchase time.
 * Serializes the code-default PlanLimits for `plan` into a Prisma-safe JSON value.
 * (Used by Phase 3 checkout; defined here so the shape stays next to resolution.)
 */
export function snapshotFor(plan: PlanId): Prisma.InputJsonValue {
  return PLAN_LIMITS[plan] as unknown as Prisma.InputJsonValue;
}
