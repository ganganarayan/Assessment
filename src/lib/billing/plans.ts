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
export const PLAN_IDS = ["FREE", "STARTER", "GROWTH", "SCALE"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

// Enforceable feature gates. Each maps to a real capability the app can withhold.
// "prioritySupport" is informational (shown, not code-gated) but kept here so the
// catalog is the single list of per-plan capabilities.
export const FEATURES = [
  "pdfReports",
  "webhooks",
  "leadExport",
  "customDomain",
  "brandingRemoved",
  "analyticsTracking",
  "staffRoles",
  "apiAccess",
  "aiReports",
  "prioritySupport",
] as const;
export type Feature = (typeof FEATURES)[number];

export type FeatureFlags = Record<Feature, boolean>;

export interface PlanLimits {
  /** Responses accepted per billing period. null = unlimited. SOFT-capped (never blocks a submission). */
  responsesPerMonth: number | null;
  /** Max published assessments. null = unlimited. HARD-capped at creation time. */
  maxAssessments: number | null;
  /** Seats (users) in the workspace. HARD-capped at invite time. */
  seats: number;
  features: FeatureFlags;
}

/** Every feature off — the Free baseline; higher tiers switch individual flags on. */
const NO_FEATURES: FeatureFlags = {
  pdfReports: false,
  webhooks: false,
  leadExport: false,
  customDomain: false,
  brandingRemoved: false,
  analyticsTracking: false,
  staffRoles: false,
  apiAccess: false,
  aiReports: false,
  prioritySupport: false,
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  FREE: {
    responsesPerMonth: 25,
    maxAssessments: 1,
    seats: 1,
    features: { ...NO_FEATURES },
  },
  STARTER: {
    responsesPerMonth: 300,
    maxAssessments: 3,
    seats: 1,
    features: { ...NO_FEATURES, pdfReports: true, webhooks: true, leadExport: true },
  },
  GROWTH: {
    responsesPerMonth: 2000,
    maxAssessments: 15,
    seats: 3,
    features: {
      ...NO_FEATURES,
      pdfReports: true,
      webhooks: true,
      leadExport: true,
      customDomain: true,
      brandingRemoved: true,
      analyticsTracking: true,
    },
  },
  SCALE: {
    responsesPerMonth: 12000,
    maxAssessments: null, // unlimited
    seats: 5, // "5+" — additional seats handled as an override/add-on later
    features: {
      ...NO_FEATURES,
      pdfReports: true,
      webhooks: true,
      leadExport: true,
      customDomain: true,
      brandingRemoved: true,
      analyticsTracking: true,
      staffRoles: true,
      apiAccess: true,
      aiReports: true,
      prioritySupport: true,
    },
  },
};

/** Monthly USD price per plan (machine value; content.ts holds the display string). */
export const PLAN_PRICE_USD: Record<PlanId, number> = {
  FREE: 0,
  STARTER: 39,
  GROWTH: 89,
  SCALE: 199,
};

/** Human label per plan, for meters/receipts/UI. */
export const PLAN_LABEL: Record<PlanId, string> = {
  FREE: "Free",
  STARTER: "Starter",
  GROWTH: "Growth",
  SCALE: "Scale",
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
export const planLimitsSchema: z.ZodType<PlanLimits> = z.object({
  responsesPerMonth: z.number().int().nonnegative().nullable(),
  maxAssessments: z.number().int().nonnegative().nullable(),
  seats: z.number().int().positive(),
  features: featureFlagsSchema,
});

/** Partial overrides — any subset of PlanLimits fields; features may be partial too. */
export const planLimitsOverrideSchema = z
  .object({
    responsesPerMonth: z.number().int().nonnegative().nullable(),
    maxAssessments: z.number().int().nonnegative().nullable(),
    seats: z.number().int().positive(),
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

/** Unlimited limits — the platform/Gita tenant and any internal/unmetered scope. */
export const UNLIMITED_LIMITS: PlanLimits = {
  responsesPerMonth: null,
  maxAssessments: null,
  seats: Number.MAX_SAFE_INTEGER,
  features: Object.fromEntries(FEATURES.map((f) => [f, true])) as FeatureFlags,
};
