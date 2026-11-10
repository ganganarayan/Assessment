import { prisma } from "@/lib/db/prisma";
import { resolvePlan } from "@/lib/billing/plan-resolve";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";
import { tenantState } from "@/lib/tenant/active";

/**
 * A plan's funnel limit, enforced AFTER a downgrade (Phase 2 of the multi-tenant review).
 *
 * The cap was only ever checked when a funnel was created. A tenant who moved from
 * Signal (10) to Gate (2), or whose trial ended on a grant of a smaller plan, kept all
 * ten live forever, because nothing looked again.
 *
 * The rule: a workspace serves at most `maxAssessments` PUBLISHED funnels. The ones that
 * stay live are the ones published FIRST, so the longest-running funnel (the one most
 * likely to have ads behind it) is the last to stop, and publishing a new funnel cannot
 * knock an old one off. The rest show the paused page until the workspace upgrades or
 * unpublishes enough to fit. Nothing is deleted or unpublished: upgrading puts every
 * funnel back on at once.
 *
 * Parked workspaces are not handled here. Parking already pauses every funnel.
 */
export interface FunnelOverage {
  limit: number | null;
  published: number;
  /** Published funnels past the limit, which are not serving. */
  pausedIds: string[];
}

export async function funnelOverage(tenantId: string | null | undefined): Promise<FunnelOverage> {
  if (!isBusinessTenant(tenantId)) return { limit: null, published: 0, pausedIds: [] };
  const plan = await resolvePlan(tenantId);
  const limit = plan.limits.maxAssessments;
  if (limit === null || plan.parked) return { limit, published: 0, pausedIds: [] };
  const live = await prisma.assessment.findMany({
    where: { tenantId, status: "PUBLISHED" },
    // A funnel published before publishedAt was recorded sorts by its creation instead.
    orderBy: [{ publishedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { id: true },
  });
  return { limit, published: live.length, pausedIds: live.slice(limit).map((a) => a.id) };
}

/** Is this one funnel past its workspace's plan limit, and therefore not serving? */
export async function funnelOverPlan(tenantId: string | null | undefined, assessmentId: string): Promise<boolean> {
  if (!isBusinessTenant(tenantId)) return false;
  return (await funnelOverage(tenantId)).pausedIds.includes(assessmentId);
}

/**
 * Whether a public funnel is NOT serving right now, for any workspace-level reason:
 * the workspace is parked, suspended or deleted, or this funnel is past the plan's
 * limit. The one question the public page, start and complete all ask, so they cannot
 * disagree about whether a funnel is open.
 */
export async function funnelNotServing(tenantId: string | null | undefined, assessmentId: string): Promise<boolean> {
  if (!isBusinessTenant(tenantId)) return false;
  if ((await tenantState(tenantId)) !== "active") return true;
  return funnelOverPlan(tenantId, assessmentId);
}
