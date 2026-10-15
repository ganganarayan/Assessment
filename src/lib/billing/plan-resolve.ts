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
  AGENCY_TENANT_LIMITS,
  AGENCY_TENANT_PLAN,
  TRIAL_LIMITS,
} from "@/lib/billing/plans";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";

/**
 * Plan + entitlement resolution, split out of entitlements.ts so it can run
 * OUTSIDE Next.js.
 *
 * Why the split: entitlements.ts is `server-only`, a package that does not
 * resolve under plain Node - so anything importing it cannot run in the Railway
 * cron (`tsx scripts/sweep-abandoned.ts`). The cron needs the feature gate,
 * because a sweep decides whether a tenant may send Conversions API events, and
 * a Free tenant must not.
 *
 * entitlements.ts re-exports everything here, so every existing caller is
 * unchanged and there is exactly one implementation of the rules.
 */

// entitledPlan and grantedPlan live in plan-grant.ts, which imports no database: the
// platform console is a client component and needs them, and importing them from here
// put PrismaClient in the browser bundle. Re-exported, so every caller of this module
// is unchanged.
// Imported as well as re-exported: `export ... from` alone does not put the names in
// this module's scope, and resolvePlan below calls both.
import { entitledPlan, grantedPlan } from "@/lib/billing/plan-grant";
export { entitledPlan, grantedPlan };

export interface ResolvedPlan {
  /** null = not rated against the catalog at all - the platform, or an internal tenant. */
  plan: PlanId | null;
  status: SubscriptionStatus | null;
  limits: PlanLimits;
  isPlatform: boolean;
  /** Inside the 14-day Signal trial - full Signal entitlements, nothing paid yet. */
  trialing: boolean;
  /**
   * Whole days left in the trial (ceiling), 0 when not trialing. Resolved here rather
   * than at each caller because the trialEndsAt column is already in this query and a
   * banner that disagrees with the billing page about "3 days" is worse than no banner.
   */
  trialDaysLeft: number;
  /**
   * PARKED: no plan, no trial left. Read-only - the funnel is paused and nothing new is
   * accepted, but every existing submission, export and report stays visible and NOTHING
   * is deleted. Parking is reversible by paying; deletion would not be.
   */
  parked: boolean;
  /**
   * The response limit the READ path compares an ALREADY-STORED `periodSeq` against -
   * the result page, /api/r, the leads list and the export. Equal to
   * `limits.responsesPerMonth` in every state but one.
   *
   * 🔴 Why it has to be separate when parked. `PARKED_LIMITS.responsesPerMonth` is 0,
   * and `isResponseLocked` locks any seq above the limit - so reading the parked limit
   * on the read path locks EVERY lead the tenant ever captured. The workspace goes
   * blank, the exports empty out, and the promise parking is built on ("nothing is
   * deleted, everything stays visible") becomes false at the one moment the tenant is
   * deciding whether to trust us with a card.
   *
   * It is not simply "unlimited when parked" either: a tenant 50 leads over their cap
   * could then unlock those 50 by CANCELLING, which prices the overage at zero and
   * rewards churn. So parking freezes the read limit at the last plan that entitled
   * them - the subscription's own snapshot, or the trial's allowance for a lapsed trial.
   * Leads they had earned stay readable; leads they had not stay locked.
   */
  readResponseLimit: number | null;
  /**
   * True when this scope is unmetered and un-gated: the platform itself, or a tenant the
   * owner flagged INTERNAL on /platform. `plan: null` alone does not say which, and every
   * caller that wrote `plan ?? "FREE"` therefore displayed and treated an unlimited tenant
   * as Free - the opposite of what the flag means. Read this instead of inferring.
   */
  unlimited: boolean;
  /**
   * Entitled THROUGH AN AGENCY ADMIN: this workspace is an agency tenant, and what pays
   * for it is somebody else's subscription. `plan` reads SIGNAL (the retail tier it is a
   * discounted copy of) and `status` is the agency admin's, so without this flag a caller
   * cannot tell an agency tenant from a retail Signal customer - which matters, because
   * an agency tenant has no billing surface of its own to send anybody to.
   */
  agencyTenant: boolean;
}

/**
 * The response allowance a PARKED tenant's already-stored leads are judged against:
 * whatever the lapsed subscription was frozen at (with its overrides), else the trial's.
 *
 * Reads the snapshot regardless of the subscription's status, which is the whole point -
 * `entitledPlan` has already decided the status entitles nothing, and this is asking a
 * different question: what were they entitled to WHEN THEY CAPTURED these leads.
 */
function lastEntitledResponseLimit(sub: Subscription | null): number | null {
  if (!sub) return PLAN_LIMITS[TRIAL_PLAN].responsesPerMonth;
  const base = parseLimitsSnapshot(sub.limitsSnapshot, sub.plan as PlanId);
  const withOverrides = sub.limitOverrides != null ? applyOverrides(base, sub.limitOverrides) : base;
  return withOverrides.responsesPerMonth;
}

/** The tenant columns plan rating needs. Shared by the tenant and its agency admin. */
interface PlanRow {
  plan: Plan;
  planExpiresAt: Date | null;
  trialEndsAt: Date | null;
  unlimited: boolean;
  subscription: Subscription | null;
}

/**
 * Rate ONE workspace against the catalog: subscription, then manual grant, then trial,
 * then parked. Pure - no queries - and it knows nothing about agency tenants, which is
 * what keeps the hierarchy one level deep. resolvePlan below is the only caller, and it
 * uses this twice: once for the workspace asked about, once for its agency admin.
 */
function ratePlanRow(row: PlanRow): ResolvedPlan {
  // An INTERNAL tenant the owner runs themselves: unlimited and un-gated, like the
  // platform. Checked before the subscription so a lapsed or absent subscription can
  // never quietly drop it to parked - which would take Meta CAPI down on a tenant that
  // is spending on ads, with nothing surfacing the change.
  if (row.unlimited) {
    return { plan: null, status: null, limits: UNLIMITED_LIMITS, isPlatform: false, unlimited: true, trialing: false, trialDaysLeft: 0, parked: false, readResponseLimit: null, agencyTenant: false };
  }

  const sub = row.subscription;
  const effective = sub ? entitledPlan(sub.plan, sub.status) : null;

  // No entitling subscription: a MANUAL GRANT decides next, then the trial.
  //
  // A grant is the owner extending a trial by hand or comping an account: the plan on
  // the tenant row, valid until `planExpiresAt`. It needs that DATE to exist - `plan`
  // defaults to GATE on every tenant, so honouring the column alone would entitle every
  // parked workspace on the install to a paid plan.
  //
  // It sits below the subscription on purpose (a paying tenant is entitled by what they
  // pay for, and a stale date must never downgrade them) and above the trial, so
  // "give this one ten more days" is a date rather than an edit to the trial.
  if (effective === null) {
    const granted = grantedPlan(row.plan, row.planExpiresAt);
    if (granted) {
      return {
        plan: granted,
        status: sub?.status ?? null,
        limits: PLAN_LIMITS[granted],
        isPlatform: false,
        unlimited: false,
        trialing: false,
        trialDaysLeft: 0,
        parked: false,
        readResponseLimit: PLAN_LIMITS[granted].responsesPerMonth,
        agencyTenant: false,
      };
    }
    const trialing = row.trialEndsAt != null && row.trialEndsAt.getTime() > Date.now();
    return {
      plan: trialing ? TRIAL_PLAN : null,
      status: sub?.status ?? null,
      // TRIAL_LIMITS, not PLAN_LIMITS[TRIAL_PLAN]: a trial carries one agency tenant on
      // top of the trial plan, and the catalog states that once.
      limits: trialing ? TRIAL_LIMITS : PARKED_LIMITS,
      isPlatform: false,
      unlimited: false,
      trialing,
      trialDaysLeft: trialing ? trialDaysLeft(row.trialEndsAt) : 0,
      parked: !trialing,
      // Parked: freeze the read limit at the last plan that entitled them - the lapsed
      // subscription's own frozen snapshot, or (no subscription at all) the trial's
      // allowance, since the trial is what let them collect in the first place.
      readResponseLimit: trialing
        ? PLAN_LIMITS[TRIAL_PLAN].responsesPerMonth
        : lastEntitledResponseLimit(sub),
      agencyTenant: false,
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
    agencyTenant: false,
  };
}

/**
 * Resolve a tenant's effective plan + limits. Order of precedence for limits:
 * per-tenant overrides > frozen snapshot (subscription) > code default (PLAN_LIMITS).
 * Never throws - a corrupt snapshot degrades to the catalog value.
 *
 * AGENCY TENANTS resolve through their agency admin, ONE hop and no further: an agency
 * tenant carries no Subscription row and no Razorpay subscription of its own, because the
 * agency admin pays one subscription for all of them. Three consequences, each deliberate:
 *
 *  - The agency admin must be entitled TO RESELL, not merely be paying. A downgrade from
 *    Agency to Gate takes `agencyTenants` to 0 and every workspace under it parks at the
 *    next request. Checking "has a subscription" instead would leave five workspaces
 *    running on a $39 plan.
 *  - A lapsed agency parks its agency tenants exactly as a lapsed tenant parks itself:
 *    read-only, funnel paused, nothing deleted.
 *  - The agency tenant's OWN escape hatches still win, because they are checked first:
 *    the `unlimited` flag, then, on fall-through, a manual grant. That is the only way to
 *    lift a single agency tenant, since limitOverrides needs a subscription to live on.
 */
export async function resolvePlan(tenantId: string | null): Promise<ResolvedPlan> {
  // The platform is never rated against a plan - not even the value its Tenant row
  // carries. Short-circuiting here (rather than reading the row) keeps the owner's own
  // funnel unmetered and un-gateable no matter what the column says, and means the hot
  // path costs a string compare instead of a query.
  if (!isBusinessTenant(tenantId)) {
    return { plan: null, status: null, limits: UNLIMITED_LIMITS, isPlatform: true, unlimited: true, trialing: false, trialDaysLeft: 0, parked: false, readResponseLimit: null, agencyTenant: false };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, subscription: true, unlimited: true, trialEndsAt: true, planExpiresAt: true, agencyAdminTenantId: true },
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
      agencyTenant: false,
    };
  }

  // The agency tenant's own unlimited flag wins over everything, its agency admin
  // included: an internal workspace the owner happens to have parked under an agency
  // must not lose CAPI the day that agency's card fails.
  if (tenant.unlimited) return ratePlanRow(tenant);

  if (tenant.agencyAdminTenantId) {
    const agency = await prisma.tenant.findUnique({
      where: { id: tenant.agencyAdminTenantId },
      select: { plan: true, subscription: true, unlimited: true, trialEndsAt: true, planExpiresAt: true, deletedAt: true, agencyAdminTenantId: true },
    });
    // A deleted agency admin entitles nobody, and one that is ITSELF an agency tenant
    // entitles nobody either - that second check is the depth limit, enforced here as
    // well as at creation, so a hand-written row cannot grow a third level.
    const rated = agency && !agency.deletedAt && !agency.agencyAdminTenantId ? ratePlanRow(agency) : null;
    if (rated && !rated.parked && rated.limits.agencyTenants > 0) {
      return {
        plan: AGENCY_TENANT_PLAN,
        // The agency admin's status, because that is the subscription paying for this
        // workspace. There is no other truthful answer: this tenant has none.
        status: rated.status,
        limits: AGENCY_TENANT_LIMITS,
        isPlatform: false,
        unlimited: rated.unlimited,
        trialing: rated.trialing,
        trialDaysLeft: rated.trialDaysLeft,
        parked: false,
        readResponseLimit: AGENCY_TENANT_LIMITS.responsesPerMonth,
        agencyTenant: true,
      };
    }
    // Agency admin lapsed, downgraded below reselling, or gone: fall through to this
    // workspace's own grant or trial, and to parked if it has neither. Falling through
    // rather than returning parked here is what lets the owner comp a single agency
    // tenant whose agency has stopped paying.
  }

  return ratePlanRow(tenant);
}

/** Whether a tenant is entitled to a feature. The platform's own scope → always true. */
export async function tenantCan(tenantId: string | null, feature: Feature): Promise<boolean> {
  const { limits } = await resolvePlan(tenantId);
  return hasFeature(limits, feature);
}
