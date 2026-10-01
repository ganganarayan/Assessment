import { z } from "zod";

/**
 * Billing plan catalog — the SOURCE OF TRUTH for what each tier grants. Pure and
 * client-safe (no prisma, no server-only): the marketing pricing UI, the in-app
 * meters, and the server-side gates all read from here.
 *
 * Phase 1 stores and resolves these; it enforces NOTHING (Phase 2 meters usage,
 * Phase 4 gates on it). Numbers mirror the live marketing tiers in
 * src/lib/marketing/content.ts — content.ts holds the display strings ("$39",
 * "300 responses / month"), this holds the machine values the code acts on.
 *
 * A limit of `null` means UNLIMITED (no cap). The platform/Gita tenant (tenantId
 * null) is treated as unlimited everywhere and never reads this table.
 */

// String-union plan ids. These are byte-identical to the Prisma `Plan` enum values,
// so the two are interchangeable without a cast — but this file stays free of any
// @prisma/client import so it can ship to the client bundle.
// FREE is gone — a free tier on a lead-qualification tool attracts the accounts that
// never qualify anyone, and it put the differentiator behind a wall the people evaluating
// it never crossed. A 14-day Signal trial replaces it. The old enum values survive in
// Postgres (see the migration) but are not part of the catalog.
export const PLAN_IDS = ["GATE", "SIGNAL", "AGENCY", "ENTERPRISE"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

// Enforceable feature gates. Each maps to a real capability the app can withhold.
// "prioritySupport" is informational (shown, not code-gated) but kept here so the
// catalog is the single list of per-plan capabilities.
//
// Gating policy (see the four PLAN_LIMITS entries below): the platform sells on
// VOLUME first — every PAID tier (Starter/Growth/Scale) carries the full set of
// "everyday" features, and only FOUR capabilities are tier-gated:
//   qualificationGate, conditionalRouting, heatmap  -> GROWTH and up
//   apiAccess                                        -> SCALE only
// Free is deliberately lean (a funnel-in tier): no paid features at all.
//
// `capi` moved to the paid baseline: server-side conversions are how a paid campaign
// is measured at all, so gating it to Growth meant a Starter customer running ads was
// optimising on browser events alone — blocked for a large share of traffic. Charging
// for the tier and then withholding the measurement it depends on loses them money and
// reads as the product being broken.
export const FEATURES = [
  "pdfReports",
  "webhooks",
  "leadExport",
  "customDomain",
  "brandingRemoved",
  // analyticsTracking = Meta browser-pixel events BEYOND the two Free signals.
  // Free always gets PageView and CompleteRegistration (see FREE_BROWSER_EVENTS) so a
  // free funnel can still be measured and retargeted; everything else — the completion
  // event above all — needs a paid plan.
  "analyticsTracking",
  "staffRoles",
  "apiAccess",
  "aiReports",
  "prioritySupport",
  // Tier-gated premium capabilities (Growth+):
  "qualificationGate", // the pre-assessment disqualify / audience gate
  "conditionalRouting", // conditional logic & branching between questions/assessments
  "capi", // server-side Meta Conversions API (audience exclusion + retargeting)
  "heatmap", // heatmap / session-recording snippet injection
  "manualReview", // free-text screening questions stored for the owner to read
] as const;

/**
 * 🟢 FOUR FLAGS DELIBERATELY NOT ADDED — checked, 2026-10-01.
 *
 * The pricing table lists exclusion audiences, the qualified-only optimisation event,
 * first-party match keys and the back-button/repeat lock. Each is ✓ on EVERY tier, and
 * each already runs unconditionally: match keys are built into every CAPI payload by
 * buildUserData, the exclusion/qualified events are emitted by the qualification flow
 * itself, and the repeat lock is a per-assessment retake policy.
 *
 * A flag that is true for every plan is dead code that reads as a real gate — and the
 * first person to "tidy up" by gating it would silently degrade CAPI match quality for a
 * paying customer, with no error anywhere. They stay as pricing-page rows, which is what
 * they are: things the product does for everyone, worth saying out loud because
 * competitors charge for them.
 */
export type Feature = (typeof FEATURES)[number];

// The "everyday" features every PAID plan carries (Starter and up). Anything NOT in
// this list is either tier-gated (the five above) or off on Free. Kept as one list so
// a plan definition can't silently drift from the "all paid plans get these" rule.
export const PAID_BASE_FEATURES = [
  // The differentiator lives in the ENTRY tier on purpose: a qualification gate behind a
  // $79 wall is a gate the buyer never experiences before deciding.
  "qualificationGate",
  "conditionalRouting",
  "capi", // server-side Conversions API — measurement, not a premium add-on
  "pdfReports",
  "webhooks",
  "leadExport",
  "analyticsTracking",
  "staffRoles",
  "prioritySupport",
  // 🔴 customDomain, brandingRemoved and aiReports are NOT here. They were, under the old
  // "every paid plan gets everything everyday" policy, and leaving them meant Gate
  // silently shipped with Signal's entire value — the upgrade had nothing left to sell.
  // verify:billing fails if they come back.
] as const satisfies ReadonlyArray<Feature>;

/**
 * FREE_BROWSER_EVENTS was removed with the free tier. It listed the two events a free
 * tenant could still fire; every paying tier fires all of them, and a PARKED tenant
 * fires none (PARKED_LIMITS turns analyticsTracking off). There is no longer a state
 * that needs a partial list.
 */

export type FeatureFlags = Record<Feature, boolean>;

export interface PlanLimits {
  /** Responses accepted per billing period. null = unlimited. SOFT-capped (never blocks a submission). */
  responsesPerMonth: number | null;
  /** Max published assessments. null = unlimited. HARD-capped at creation time. */
  maxAssessments: number | null;
  /** Seats (users) in the workspace. HARD-capped at invite time. */
  seats: number;
  /**
   * Ad accounts the tenant may configure. NOT YET ENFORCED — the app has no AdAccount
   * model (docs/FEATURE-GATES.md §8a); a tenant has exactly one Meta config today. The
   * number is carried here so the catalog matches the published pricing and the gate has
   * somewhere to land when the model exists.
   */
  adAccounts: number;
  features: FeatureFlags;
}

/** Every feature off — the Free baseline; higher tiers switch individual flags on. */
const NO_FEATURES: FeatureFlags = Object.fromEntries(
  FEATURES.map((f) => [f, false]),
) as FeatureFlags;

/** The everyday features on (the "all paid plans get these" set) — the paid baseline. */
const PAID_BASE: FeatureFlags = {
  ...NO_FEATURES,
  ...(Object.fromEntries(PAID_BASE_FEATURES.map((f) => [f, true])) as Partial<FeatureFlags>),
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  // Gate — the differentiator in full, at the smallest volume. Everything the
  // qualification mechanism needs is ON: withholding it here would mean the tier that
  // exists to prove the product cannot demonstrate it.
  GATE: {
    responsesPerMonth: 150,
    maxAssessments: 2,
    seats: 1,
    adAccounts: 1,
    features: { ...PAID_BASE },
  },
  // Signal — brand, domain, AI and the badge removed.
  SIGNAL: {
    responsesPerMonth: 1000,
    maxAssessments: 10,
    seats: 3,
    adAccounts: 2,
    features: {
      ...PAID_BASE,
      customDomain: true,
      brandingRemoved: true,
      aiReports: true,
      heatmap: true,
      manualReview: true,
    },
  },
  // Agency — unlimited scorecards, sub-accounts, API. The sub-account FEATURE does not
  // exist yet (docs/FEATURE-GATES.md §8b); the flag is here so the tier is complete.
  AGENCY: {
    responsesPerMonth: 5000,
    maxAssessments: null,
    seats: 10,
    adAccounts: 10,
    features: {
      ...PAID_BASE,
      customDomain: true,
      brandingRemoved: true,
      aiReports: true,
      heatmap: true,
      manualReview: true,
      apiAccess: true,
    },
  },
  // Enterprise — published as "from $499". Real limits come from the per-tenant override
  // resolvePlan already applies, because a flat published number would cap the revenue on
  // the biggest accounts while uncapping their cost.
  ENTERPRISE: {
    responsesPerMonth: null,
    maxAssessments: null,
    seats: 25,
    adAccounts: 25,
    features: {
      ...PAID_BASE,
      customDomain: true,
      brandingRemoved: true,
      aiReports: true,
      heatmap: true,
      manualReview: true,
      apiAccess: true,
    },
  },
};

/** Monthly USD price per plan (machine value; content.ts holds the display string). */
export const PLAN_PRICE_USD: Record<PlanId, number> = {
  GATE: 39,
  SIGNAL: 79,
  AGENCY: 199,
  ENTERPRISE: 499,
};

/** Annual price PER MONTH (billed yearly). Enterprise is quoted, never published. */
export const PLAN_PRICE_USD_ANNUAL: Record<PlanId, number | null> = {
  GATE: 32,
  SIGNAL: 69,
  AGENCY: 175,
  ENTERPRISE: null,
};

/** The plan a trial grants, and how long it runs. */
export const TRIAL_PLAN: PlanId = "SIGNAL";
export const TRIAL_DAYS = 14;

/** Human label per plan, for meters/receipts/UI. */
export const PLAN_LABEL: Record<PlanId, string> = {
  GATE: "Gate",
  SIGNAL: "Signal",
  AGENCY: "Agency",
  ENTERPRISE: "Enterprise",
};

// --- Pure helpers -----------------------------------------------------------

/** true when a limit value means "no cap". */
export function isUnlimited(limit: number | null): limit is null {
  return limit === null;
}

/** The code-default limits for a plan (before any snapshot/override). */
export function limitsForPlan(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan];
}

/** Whether a resolved set of limits grants a feature. */
export function hasFeature(limits: PlanLimits, feature: Feature): boolean {
  return limits.features[feature] === true;
}

/**
 * true when `used` is at or over `limit`. Unlimited (null) is never over.
 * (Used by the meters/soft-cap logic in later phases; pure so it is testable.)
 */
export function isOverLimit(used: number, limit: number | null): boolean {
  if (isUnlimited(limit)) return false;
  return used >= limit;
}

/** Fraction (0..>1) of a limit consumed. Unlimited → 0. */
export function usageFraction(used: number, limit: number | null): number {
  if (isUnlimited(limit) || limit <= 0) return 0;
  return used / limit;
}

// --- Snapshot / override validation ----------------------------------------

const featureFlagsSchema = z.object(
  Object.fromEntries(FEATURES.map((f) => [f, z.boolean()])) as Record<Feature, z.ZodBoolean>,
);

/** Zod schema for a frozen PlanLimits snapshot (Subscription.limitsSnapshot). */
export const planLimitsSchema = z.object({
  responsesPerMonth: z.number().int().nonnegative().nullable(),
  maxAssessments: z.number().int().nonnegative().nullable(),
  seats: z.number().int().positive(),
  // Optional: snapshots frozen before ad accounts existed have no such field, and a
  // strict schema would reject them and silently re-rate that customer to the catalog.
  adAccounts: z.number().int().nonnegative().default(1),
  features: featureFlagsSchema,
});

/** Partial overrides — any subset of PlanLimits fields; features may be partial too. */
export const planLimitsOverrideSchema = z
  .object({
    responsesPerMonth: z.number().int().nonnegative().nullable(),
    maxAssessments: z.number().int().nonnegative().nullable(),
    seats: z.number().int().positive(),
    adAccounts: z.number().int().nonnegative(),
    features: z.record(z.enum(FEATURES), z.boolean()),
  })
  .partial();

export type PlanLimitsOverride = z.infer<typeof planLimitsOverrideSchema>;

/**
 * Parse a stored snapshot (Json) into PlanLimits. NEVER throws — a corrupt/absent
 * snapshot falls back to the code default for `plan`, so a bad row degrades to the
 * catalog value rather than taking down a gate check (same resilience posture as
 * settings/config.ts safeDecrypt).
 */
export function parseLimitsSnapshot(raw: unknown, plan: PlanId): PlanLimits {
  const parsed = planLimitsSchema.safeParse(raw);
  return parsed.success ? parsed.data : PLAN_LIMITS[plan];
}

/**
 * Apply per-tenant overrides on top of base limits. A missing override field keeps
 * the base value; a `features` override is merged flag-by-flag. Pure.
 */
export function applyOverrides(base: PlanLimits, override: unknown): PlanLimits {
  const parsed = planLimitsOverrideSchema.safeParse(override);
  if (!parsed.success) return base;
  const o = parsed.data;
  return {
    responsesPerMonth: o.responsesPerMonth !== undefined ? o.responsesPerMonth : base.responsesPerMonth,
    maxAssessments: o.maxAssessments !== undefined ? o.maxAssessments : base.maxAssessments,
    seats: o.seats !== undefined ? o.seats : base.seats,
    adAccounts: o.adAccounts !== undefined ? o.adAccounts : base.adAccounts,
    features: { ...base.features, ...(o.features ?? {}) },
  };
}

// --- Usage period keys ------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Calendar-month key, e.g. "2026-09" (UTC). Used for Free tenants. */
export function calendarMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/**
 * The usage-period key for RESPONSES metering. A paid tenant meters against its
 * Razorpay billing period (keyed by the period-start date, "YYYY-MM-DD"); a Free
 * tenant (no period start) meters against the calendar month. Pure.
 */
export function usagePeriodKey(periodStart: Date | null, now: Date): string {
  if (periodStart) {
    return `${periodStart.getUTCFullYear()}-${pad2(periodStart.getUTCMonth() + 1)}-${pad2(periodStart.getUTCDate())}`;
  }
  return calendarMonthKey(now);
}

/**
 * PARKED limits — a lapsed trial or subscription.
 *
 * 🔴 Everything off, zero volume. The first version of this returned the GATE catalog
 * alongside `parked: true`, and every gate in the app reads LIMITS, not the flag — so a
 * parked tenant kept the qualification gate, CAPI, webhooks and exports in full. The
 * trial never had to convert. Expressing parked as limits closes it everywhere at once,
 * instead of relying on each of dozens of call sites to check a second field.
 *
 * responsesPerMonth 0 means the existing capture-but-lock path takes over: answers are
 * still stored, the result is withheld. Nothing is destroyed by parking.
 */
export const PARKED_LIMITS: PlanLimits = {
  responsesPerMonth: 0,
  maxAssessments: 0,
  seats: 1,
  adAccounts: 0,
  features: { ...NO_FEATURES },
};

/** Unlimited limits — the platform/Gita tenant and any internal/unmetered scope. */
export const UNLIMITED_LIMITS: PlanLimits = {
  responsesPerMonth: null,
  maxAssessments: null,
  adAccounts: Number.MAX_SAFE_INTEGER,
  seats: Number.MAX_SAFE_INTEGER,
  features: Object.fromEntries(FEATURES.map((f) => [f, true])) as FeatureFlags,
};
