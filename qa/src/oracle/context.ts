/**
 * The two facts an expectation needs that are not in the funnel row.
 *
 * capiAllowed: whether this tenant is entitled to server-side events at all. The app
 * checks it with tenantCan, which is server-only, so this reads the tenant's plan and
 * asks the pure plan catalogue - the same source tenantCan resolves against. Platform
 * scope is unmetered and always allowed. If the two ever disagree, the symptom is an
 * event-count assertion failing, which is the right place to find out.
 *
 * redirectSlugByAssessmentId: the audience gate stores a target as an assessment id,
 * and a browser lands on a slug, so the ids have to be resolved to drive it.
 */
import { db } from "../db.js";
import { isPlatformScope } from "../../../src/lib/tenant/platform-tenant.js";
import { PLAN_LIMITS, type PlanId } from "../../../src/lib/billing/plans.js";
import type { Funnel } from "../config/read.js";

export interface OracleContext {
  capiAllowed: boolean;
  redirectSlugByAssessmentId: Map<string, string>;
}

export async function oracleContext(funnel: Funnel): Promise<OracleContext> {
  const tenantId = funnel.row.tenantId;
  let capiAllowed = true;
  if (!isPlatformScope(tenantId) && tenantId) {
    const tenant = await db().tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    const plan = (tenant?.plan ?? "FREE") as PlanId;
    capiAllowed = PLAN_LIMITS[plan]?.features.capi === true;
  }

  const targets = funnel.audience.roles.map((r) => r.target).filter((t): t is string => !!t);
  const redirectSlugByAssessmentId = new Map<string, string>();
  if (targets.length > 0) {
    const rows = await db().assessment.findMany({
      where: { id: { in: targets } },
      select: { id: true, slug: true },
    });
    for (const r of rows) redirectSlugByAssessmentId.set(r.id, r.slug);
  }

  return { capiAllowed, redirectSlugByAssessmentId };
}
