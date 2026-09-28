import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { istDateRangeToUtc } from "@/lib/date";
import { PLAN_PRICE_USD, type PlanId } from "@/lib/billing/plans";
import { PLATFORM_OWNER_EMAIL } from "@/lib/auth/platform";

/**
 * Aggregations for the Assess360 SaaS marketing-funnel dashboard (super-admin).
 * Landing views + UTM come from PlatformPageView; signups are tenants; paid + MRR
 * come from ACTIVE subscriptions. Everything platform-wide (no tenant scope).
 */

type Range = { from?: string; to?: string };

function createdAtFilter(range?: Range): Prisma.DateTimeFilter | undefined {
  const { gte, lte } = istDateRangeToUtc(range?.from, range?.to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

export interface PlatformFunnelStats {
  landingViews: number;
  uniqueViews: number;
  /** People who completed sign-up — User rows, which is what CompleteRegistration
   *  fires on. The platform owner's own account is excluded (it is not a signup). */
  signups: number;
  /** Signups that actually got a workspace. Provisioning happens in a separate
   *  auth hook that swallows its failures, so a gap here is a real, silent fault —
   *  which is why it is its own number rather than being reported AS signups. */
  provisioned: number;
  paidCount: number;
  /** Current monthly recurring revenue from ACTIVE subscriptions, in USD. */
  mrrUsd: number;
}

export async function getPlatformFunnelStats(range?: Range): Promise<PlatformFunnelStats> {
  const createdAt = createdAtFilter(range);
  const pvWhere: Prisma.PlatformPageViewWhereInput = { isBot: false, ...(createdAt ? { createdAt } : {}) };

  const [landingViews, uniqueRows, signups, provisioned, activeSubs] = await Promise.all([
    prisma.platformPageView.count({ where: pvWhere }),
    prisma.platformPageView.groupBy({ by: ["visitorId"], where: pvWhere }),
    // Signups are USERS, not tenants. CompleteRegistration fires the moment the
    // account is created; the tenant is provisioned afterwards by a separate auth
    // hook that logs its failures and moves on — and is skipped entirely for the
    // owner's own account. Counting tenants here reported 0 signups while Meta
    // counted every one of them, with no way to see the two had diverged.
    prisma.user.count({
      where: {
        ...(createdAt ? { createdAt } : {}),
        NOT: { email: { equals: PLATFORM_OWNER_EMAIL, mode: "insensitive" } },
      },
    }),
    prisma.tenant.count({ where: createdAt ? { createdAt } : {} }),
    // Paid is point-in-time (current active subscriptions), not range-filtered.
    prisma.subscription.findMany({ where: { status: "ACTIVE" }, select: { plan: true } }),
  ]);

  const mrrUsd = activeSubs.reduce((sum, s) => sum + (PLAN_PRICE_USD[s.plan as PlanId] ?? 0), 0);
  return {
    landingViews,
    uniqueViews: uniqueRows.length,
    signups,
    provisioned,
    paidCount: activeSubs.length,
    mrrUsd,
  };
}

export interface PlatformUtmRow {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  views: number;
}

export async function getPlatformUtmBreakdown(range?: Range): Promise<PlatformUtmRow[]> {
  const createdAt = createdAtFilter(range);
  const rows = await prisma.platformPageView.groupBy({
    by: ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"],
    where: { isBot: false, ...(createdAt ? { createdAt } : {}) },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({
      source: r.utmSource,
      medium: r.utmMedium,
      campaign: r.utmCampaign,
      term: r.utmTerm,
      content: r.utmContent,
      views: r._count._all,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 25);
}
