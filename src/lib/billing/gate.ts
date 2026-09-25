import "server-only";
import { UsageMetric } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { usagePeriodKey, type Feature } from "@/lib/billing/plans";
import { resolvePlan, tenantCan } from "@/lib/billing/entitlements";

/**
 * Phase 4 — ENFORCEMENT. entitlements.ts RESOLVES a tenant's plan/limits; this module
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
 * A tenantId of null = the platform/Gita scope: unlimited + unmetered, never gated.
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
  if (tenantId === null) return { ok: true };
  const { limits } = await resolvePlan(tenantId);
  const limit = limits.maxAssessments;
  if (limit === null) return { ok: true }; // unlimited
  const used = await prisma.assessment.count({ where: { tenantId } });
  return used >= limit ? { ok: false, limit, used } : { ok: true };
}

// --- Responses (capture-but-lock) -------------------------------------------

/**
 * Cheap, NON-consuming peek: is the tenant already at/over its response cap for the
 * current period? Used to skip expensive work (AI statement generation) for a
 * completion that is about to be locked. Advisory only — the authoritative lock
 * decision is `meterResponse` (below). Platform / unlimited → always false.
 */
export async function responsesOverCap(tenantId: string | null, now: Date = new Date()): Promise<boolean> {
  if (tenantId === null) return false;
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
  /** true when seq > limit — the completion is over the cap and must be locked. */
  locked: boolean;
}

/**
 * Meter ONE completion against the tenant's response cap and return whether it lands
 * over the cap. Atomic (a single upsert-increment), so the returned count is a stable,
 * gap-free sequence even under concurrent completions. Call this EXACTLY ONCE per
 * completion — only for the winning STARTED->COMPLETED writer — and never for a
 * re-completion (guard on `periodSeq == null`). Platform / unlimited → not metered.
 */
export async function meterResponse(tenantId: string | null, now: Date = new Date()): Promise<ResponseMeter> {
  if (tenantId === null) return { metered: false, seq: 0, limit: null, locked: false };
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
 * the tenant's CURRENT limit, so raising the plan unlocks past leads instantly with no
 * backfill. A null seq (pre-gate/grandfathered/platform) is never locked.
 */
export async function isResponseLocked(tenantId: string | null, periodSeq: number | null): Promise<boolean> {
  if (tenantId === null || periodSeq == null) return false;
  const { limits } = await resolvePlan(tenantId);
  const limit = limits.responsesPerMonth;
  return limit != null && periodSeq > limit;
}

/**
 * The tenant's current response limit (null = unlimited). Handy for the leads-list
 * padlock, which filters `periodSeq <= limit` and counts the rest as locked, without
 * calling `isResponseLocked` per row.
 */
export async function responseLimitFor(tenantId: string | null): Promise<number | null> {
  if (tenantId === null) return null;
  const { limits } = await resolvePlan(tenantId);
  return limits.responsesPerMonth;
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
    if (tenantId) {
      const s = await prisma.appSetting.findUnique({ where: { tenantId }, select: { supportEmail: true } });
      const own = clean(s?.supportEmail);
      if (own) return own;
    }
    const singleton = await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { supportEmail: true } });
    return clean(singleton?.supportEmail);
  } catch {
    return null;
  }
}
