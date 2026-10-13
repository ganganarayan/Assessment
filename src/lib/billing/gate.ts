import "server-only";
import { UsageMetric } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { usagePeriodKey, type Feature } from "@/lib/billing/plans";
import { resolvePlan, tenantCan } from "@/lib/billing/entitlements";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";

/**
 * Phase 4 - ENFORCEMENT. entitlements.ts RESOLVES a tenant's plan/limits; this module
 * is the thin set of server-only gates that ACT on them:
 *
 *  - assessments  HARD cap  (block creation past maxAssessments)
 *  - responses    HARD cap with CAPTURE-BUT-LOCK: the lead's answers are still stored,
 *                 but the completion is stamped `periodSeq` and, when over the cap, the
 *                 whole downstream fan-out is suppressed (no webhook / CAPI / WABA / AI /
 *                 result) and the tenant can neither view nor export it until they upgrade.
 *  - features     the five tier-gated capabilities (qualificationGate, conditionalRouting,
 *                 capi, heatmap -> Growth+, apiAccess -> Scale).
 *
 * The PLATFORM scope - the Platform tenant, or a legacy null from before the re-home
 * (isPlatformScope) - is unlimited and unmetered, never gated. It is not a customer of
 * itself, so metering it would count the owner's own traffic against a plan nobody buys.
 */

/** The tenant's RESPONSES usage-period key (paid billing period, else calendar month). */
async function responsePeriodKey(tenantId: string, now: Date): Promise<string> {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { currentPeriodStart: true },
  });
  return usagePeriodKey(sub?.currentPeriodStart ?? null, now);
}

// --- Assessments (hard cap) -------------------------------------------------

export type CreateAssessmentGate =
  | { ok: true }
  | { ok: false; limit: number; used: number };

/**
 * Whether the tenant may create/publish one more assessment. HARD: blocks at the cap.
 * Platform scope and unlimited plans always pass. Call this at creation time; on
 * `{ ok: false }` the caller refuses and shows an upgrade prompt.
 */
export async function assertCanCreateAssessment(tenantId: string | null): Promise<CreateAssessmentGate> {
  if (!isBusinessTenant(tenantId)) return { ok: true };
  const { limits } = await resolvePlan(tenantId);
  const limit = limits.maxAssessments;
  if (limit === null) return { ok: true }; // unlimited
  const used = await prisma.assessment.count({ where: { tenantId } });
  return used >= limit ? { ok: false, limit, used } : { ok: true };
}

// --- Ad accounts (hard cap) -------------------------------------------------

export type CreateAdAccountGate =
  | { ok: true }
  | { ok: false; limit: number; used: number };

/**
 * Whether the tenant may configure one more ad account. HARD: blocks at the cap.
 *
 * 🔴 WHY THIS EXISTS AT ALL. The pricing page has metered ad accounts (1 / 2 / 10 / 25)
 * since launch, `PlanLimits.adAccounts` has carried the number since the billing work,
 * and NOTHING read it - so every plan's ad-account line was decorative and a Gate
 * customer could run as many as they liked. A published limit nobody enforces is not a
 * generous default, it is a price list that does not describe the product.
 *
 * The SETTINGS write-through is deliberately NOT metered (see updateMetaSettings): it
 * moves a tenant's existing pixel out of the legacy columns into the row that replaced
 * them, which adds no capacity. Metering it would mean a Gate tenant, capped at one,
 * could not save the one pixel they already had.
 */
export async function assertCanCreateAdAccount(tenantId: string | null): Promise<CreateAdAccountGate> {
  if (!isBusinessTenant(tenantId)) return { ok: true };
  const { limits } = await resolvePlan(tenantId);
  const limit = limits.adAccounts;
  const used = await prisma.adAccount.count({ where: { tenantId } });
  return used >= limit ? { ok: false, limit, used } : { ok: true };
}

// --- Agency tenants (hard cap) ---------------------------------------------

export interface AgencyTenantUsage {
  /** Agency tenants the plan includes (0 = this tier does not resell). */
  included: number;
  /** Slots bought beyond the included count, $29/mo each, confirmed paid. */
  extra: number;
  /** included + extra - what the gate compares against. */
  limit: number;
  /** Active agency tenants. A soft-deleted one frees its slot at once. */
  used: number;
}

/**
 * How many agency tenants this workspace may own, and how many it has.
 *
 * Shared by the gate below and by the workspace's own meter, so the number that blocks a
 * create and the number shown next to it cannot disagree.
 *
 * 🔴 The paid extras are only added when the PLAN still entitles reselling. Read on
 * their own they would survive a lapse or a downgrade: `agencyTenants` goes to 0 when a
 * subscription parks or moves to Gate, and `extra` sitting on the subscription row would
 * then be the only number left, keeping five workspaces alive on a cancelled account.
 */
export async function agencyTenantUsage(tenantId: string | null): Promise<AgencyTenantUsage> {
  if (!isBusinessTenant(tenantId)) {
    // The platform owner creates tenants from /platform, uncapped. Nothing to meter.
    return { included: Number.MAX_SAFE_INTEGER, extra: 0, limit: Number.MAX_SAFE_INTEGER, used: 0 };
  }
  const resolved = await resolvePlan(tenantId);
  const used = await prisma.tenant.count({ where: { agencyAdminTenantId: tenantId, deletedAt: null } });
  const included = resolved.agencyTenant ? 0 : resolved.limits.agencyTenants;
  if (included <= 0) return { included: 0, extra: 0, limit: 0, used };
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { extraAgencyTenants: true },
  });
  const extra = sub?.extraAgencyTenants ?? 0;
  return { included, extra, limit: included + extra, used };
}

export type CreateAgencyTenantGate =
  | { ok: true }
  | { ok: false; limit: number; used: number; reason: "notReselling" | "nested" | "cap" };

/**
 * Whether this workspace may create one more agency tenant. HARD: blocks at the cap.
 *
 * Three distinct refusals, because "no" on its own is not actionable:
 *  - `notReselling`: the plan includes none (Gate, Signal, a parked or lapsed account).
 *    The answer is an upgrade, or paying what is owed.
 *  - `nested`: the caller is itself an agency tenant. Depth is one, and no amount of
 *    paying changes it. resolvePlan already reports 0 for an agency tenant, so this is a
 *    second statement of the same rule with an error somebody can read.
 *  - `cap`: at the limit. The answer is $29 for one more slot.
 */
export async function assertCanCreateAgencyTenant(tenantId: string | null): Promise<CreateAgencyTenantGate> {
  if (!isBusinessTenant(tenantId)) return { ok: true };
  const resolved = await resolvePlan(tenantId);
  if (resolved.agencyTenant) return { ok: false, limit: 0, used: 0, reason: "nested" };
  const usage = await agencyTenantUsage(tenantId);
  if (usage.limit <= 0) return { ok: false, limit: 0, used: usage.used, reason: "notReselling" };
  return usage.used >= usage.limit
    ? { ok: false, limit: usage.limit, used: usage.used, reason: "cap" }
    : { ok: true };
}

// --- Seats (hard cap) -------------------------------------------------------

export type AddSeatGate =
  | { ok: true }
  | { ok: false; limit: number; used: number };

/**
 * Whether the tenant may add one more user. HARD: blocks at the cap.
 *
 * As unenforced as ad accounts were: "1 / 3 / 10 users" was published, metered in the
 * catalog, and read by nothing but the usage meter.
 *
 * 🔴 SOFT-DELETED USERS DO NOT COUNT, and that is not a detail. `User.deletedAt` exists
 * and the usage meter counted every row regardless, so gating on that count would have
 * told a Signal tenant who had hired and removed two staff that their three seats were
 * full - a refusal they could not act on, about people who no longer have access. A seat
 * is an active user.
 */
export async function assertCanAddSeat(tenantId: string | null): Promise<AddSeatGate> {
  if (!isBusinessTenant(tenantId)) return { ok: true };
  const { limits } = await resolvePlan(tenantId);
  const limit = limits.seats;
  const used = await prisma.user.count({ where: { tenantId, deletedAt: null } });
  return used >= limit ? { ok: false, limit, used } : { ok: true };
}

// --- Responses (capture-but-lock) -------------------------------------------

/**
 * Cheap, NON-consuming peek: is the tenant already at/over its response cap for the
 * current period? Used to skip expensive work (AI statement generation) for a
 * completion that is about to be locked. Advisory only - the authoritative lock
 * decision is `meterResponse` (below). Platform / unlimited → always false.
 */
export async function responsesOverCap(tenantId: string | null, now: Date = new Date()): Promise<boolean> {
  if (!isBusinessTenant(tenantId)) return false;
  const { limits } = await resolvePlan(tenantId);
  const limit = limits.responsesPerMonth;
  if (limit === null) return false; // unlimited
  const periodKey = await responsePeriodKey(tenantId, now);
  const counter = await prisma.usageCounter.findUnique({
    where: { tenantId_metric_periodKey: { tenantId, metric: UsageMetric.RESPONSES, periodKey } },
    select: { count: true },
  });
  return (counter?.count ?? 0) >= limit;
}

export interface ResponseMeter {
  /** true when the counter was actually incremented (metered tenant). */
  metered: boolean;
  /** This completion's 1-based index within the period; 0 when unmetered. */
  seq: number;
  /** The tenant's response limit; null = unlimited. */
  limit: number | null;
  /** true when seq > limit - the completion is over the cap and must be locked. */
  locked: boolean;
}

/**
 * Meter ONE completion against the tenant's response cap and return whether it lands
 * over the cap. Atomic (a single upsert-increment), so the returned count is a stable,
 * gap-free sequence even under concurrent completions. Call this EXACTLY ONCE per
 * completion - only for the winning STARTED->COMPLETED writer - and never for a
 * re-completion (guard on `periodSeq == null`). Platform / unlimited → not metered.
 */
export async function meterResponse(tenantId: string | null, now: Date = new Date()): Promise<ResponseMeter> {
  if (!isBusinessTenant(tenantId)) return { metered: false, seq: 0, limit: null, locked: false };
  const { limits } = await resolvePlan(tenantId);
  const limit = limits.responsesPerMonth;
  if (limit === null) return { metered: false, seq: 0, limit: null, locked: false };
  const periodKey = await responsePeriodKey(tenantId, now);
  const updated = await prisma.usageCounter.upsert({
    where: { tenantId_metric_periodKey: { tenantId, metric: UsageMetric.RESPONSES, periodKey } },
    create: { tenantId, metric: UsageMetric.RESPONSES, periodKey, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  const seq = updated.count;
  return { metered: true, seq, limit, locked: seq > limit };
}

/**
 * Read-path lock test used by every place that would SHOW an over-cap lead (the result
 * page, /api/r, the tenant leads list/export). Compares the stored `periodSeq` against
 * `readResponseLimit`, so raising the plan unlocks past leads instantly with no backfill.
 * A null seq (pre-gate/grandfathered/platform) is never locked.
 *
 * 🔴 Reads `readResponseLimit`, NOT `limits.responsesPerMonth`. They differ in exactly
 * one state: parked, where the live limit is 0 and reading it here would lock every lead
 * the tenant ever captured - emptying their workspace and their exports at the moment
 * they are deciding whether to pay. See the field's note in plan-resolve.
 */
export async function isResponseLocked(tenantId: string | null, periodSeq: number | null): Promise<boolean> {
  if (!isBusinessTenant(tenantId) || periodSeq == null) return false;
  const { readResponseLimit } = await resolvePlan(tenantId);
  return readResponseLimit != null && periodSeq > readResponseLimit;
}

/**
 * The tenant's response limit FOR THE READ PATH (null = unlimited). Handy for the
 * leads-list padlock, which filters `periodSeq <= limit` and counts the rest as locked,
 * without calling `isResponseLocked` per row. Same parked caveat as `isResponseLocked`.
 */
export async function responseLimitFor(tenantId: string | null): Promise<number | null> {
  if (!isBusinessTenant(tenantId)) return null;
  return (await resolvePlan(tenantId)).readResponseLimit;
}

// --- Feature gates ----------------------------------------------------------

/**
 * Throwing feature gate for server actions/routes that prefer fail-fast over a result
 * union. Platform scope always passes. Prefer `tenantCan` (re-exported) where a boolean
 * is enough (e.g. hiding UI); use this to hard-stop a privileged mutation off-plan.
 */
export class FeatureGateError extends Error {
  constructor(public readonly feature: Feature) {
    super(`This feature requires a higher plan: ${feature}`);
    this.name = "FeatureGateError";
  }
}

export async function assertFeature(tenantId: string | null, feature: Feature): Promise<void> {
  if (!(await tenantCan(tenantId, feature))) throw new FeatureGateError(feature);
}

export { tenantCan };

// --- Support address (for the locked "results unavailable" screen) ----------

/**
 * The support email a RESPONDENT sees when their result is locked (tenant over cap).
 * Per-tenant AppSetting, falling back to the platform/Gita singleton row. null/blank
 * → the screen renders without a mailto. Never throws.
 */
export async function supportEmailFor(tenantId: string | null): Promise<string | null> {
  const clean = (v: string | null | undefined): string | null => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  };
  try {
    if (isBusinessTenant(tenantId)) {
      const s = await prisma.appSetting.findUnique({
        where: { tenantId },
        select: { supportEmail: true },
      });
      const own = clean(s?.supportEmail);
      if (own) return own;
    }
    const singleton = await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { supportEmail: true } });
    return clean(singleton?.supportEmail);
  } catch {
    return null;
  }
}
