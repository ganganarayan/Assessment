import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PLAN_LIMITS, usageFraction, usagePeriodKey, type PlanId } from "@/lib/billing/plans";

/**
 * Server-side entitlement + usage resolution for a tenant. Mirrors the shape of
 * settings/config.ts (resolveMetaConfig): a `tenantId` of null = the platform/Gita
 * scope, which is UNLIMITED and unmetered. Phase 1 only RESOLVES this - no gate
 * calls this yet (Phase 2 meters, Phase 4 enforces).
 */

/**
 * Plan resolution + the feature gate live in plan-resolve.ts, which is NOT
 * server-only: the Railway cron runs outside Next, where the `server-only`
 * package does not resolve, and a sweep still has to honour the gate. They are
 * re-exported here so every existing caller keeps importing from entitlements.
 */
import { resolvePlan } from "@/lib/billing/plan-resolve";
export { entitledPlan, resolvePlan, tenantCan, type ResolvedPlan } from "@/lib/billing/plan-resolve";

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
  /** Ad accounts configured vs allowed - enforced since 2026-10-13, so it is shown. */
  adAccounts: UsageLine;
}

/**
 * JUST the response counter and its cap, in two queries.
 *
 * Separate from getUsage because the workspace layout renders on every /w page and the
 * banner only needs this one line: counting assessments and users there would add two
 * COUNT(*)s per page view to show numbers nobody is looking at. getUsage stays the full
 * picture for the billing screen.
 *
 * Returns null when there is nothing to warn about - the platform, an internal tenant,
 * an unlimited plan, or a parked workspace (which already has its own notice).
 */
export async function responseUsageFor(
  tenantId: string | null,
  now: Date = new Date(),
): Promise<{ used: number; limit: number } | null> {
  const resolved = await resolvePlan(tenantId);
  if (resolved.isPlatform || resolved.unlimited || resolved.parked) return null;
  const limit = resolved.limits.responsesPerMonth;
  if (limit === null) return null;
  const sub = await prisma.subscription.findUnique({
    where: { tenantId: tenantId as string },
    select: { currentPeriodStart: true },
  });
  const periodKey = usagePeriodKey(sub?.currentPeriodStart ?? null, now);
  const counter = await prisma.usageCounter.findUnique({
    where: { tenantId_metric_periodKey: { tenantId: tenantId as string, metric: "RESPONSES", periodKey } },
    select: { count: true },
  });
  return { used: counter?.count ?? 0, limit };
}

/**
 * Current usage vs limits for the meters UI (Phase 2 wires the RESPONSES counter;
 * in Phase 1 the counter is absent so responses.used reads 0). Assessments and
 * seats are COUNT()ed live - no counter table. Platform scope reports unlimited.
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
      adAccounts: line(0, null),
    };
  }

  // Period start comes from the subscription (paid) or is null (Free → calendar month).
  const sub = await prisma.subscription.findUnique({
    where: { tenantId: tenantId as string },
    select: { currentPeriodStart: true },
  });
  const periodKey = usagePeriodKey(sub?.currentPeriodStart ?? null, now);

  const [responseCounter, assessmentCount, seatCount, adAccountCount] = await Promise.all([
    prisma.usageCounter.findUnique({
      where: {
        tenantId_metric_periodKey: { tenantId: tenantId as string, metric: "RESPONSES", periodKey },
      },
      select: { count: true },
    }),
    prisma.assessment.count({ where: { tenantId: tenantId as string } }),
    // Active users only. Counting soft-deleted rows overstated the meter and, once
    // assertCanAddSeat reads the same definition, would refuse seats a tenant has
    // genuinely freed up by removing staff.
    prisma.user.count({ where: { tenantId: tenantId as string, deletedAt: null } }),
    prisma.adAccount.count({ where: { tenantId: tenantId as string } }),
  ]);

  return {
    plan: resolved.plan,
    isPlatform: false,
    responses: line(responseCounter?.count ?? 0, limits.responsesPerMonth),
    assessments: line(assessmentCount, limits.maxAssessments),
    seats: line(seatCount, limits.seats),
    adAccounts: line(adAccountCount, limits.adAccounts),
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
