import { z } from "zod";
import { monthlyWindowStart } from "@/lib/billing/renewal";

/**
 * Billing plan catalog - the SOURCE OF TRUTH for what each tier grants. Pure and
 * client-safe (no prisma, no server-only): the marketing pricing UI, the in-app
 * meters, and the server-side gates all read from here.
 *
 * Phase 1 stores and resolves these; it enforces NOTHING (Phase 2 meters usage,
 * Phase 4 gates on it). Numbers mirror the live marketing tiers in
 * src/lib/marketing/content.ts - content.ts holds the display strings ("$39",
 * "300 responses / month"), this holds the machine values the code acts on.
 *
 * A limit of `null` means UNLIMITED (no cap). The platform/Gita tenant (tenantId
 * null) is treated as unlimited everywhere and never reads this table.
 */

// String-union plan ids. These are byte-identical to the Prisma `Plan` enum values,
// so the two are interchangeable without a cast - but this file stays free of any
// @prisma/client import so it can ship to the client bundle.
// FREE is gone - a free tier on a lead-qualification tool attracts the accounts that
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
// VOLUME first - every PAID tier (Starter/Growth/Scale) carries the full set of
// "everyday" features, and only FOUR capabilities are tier-gated:
//   qualificationGate, conditionalRouting, heatmap  -> GROWTH and up
//   apiAccess                                        -> SCALE only
// Free is deliberately lean (a funnel-in tier): no paid features at all.
//
// `capi` moved to the paid baseline: server-side conversions are how a paid campaign
// is measured at all, so gating it to Growth meant a Starter customer running ads was
// optimising on browser events alone - blocked for a large share of traffic. Charging
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
  // free funnel can still be measured and retargeted; everything else - the completion
  // event above all - needs a paid plan.
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
  // SCORE BANDS on the gate (every PAID tier, including Gate). Deliberately NOT sold
  // with the router below.
  //
  // The objection that kills this sale is "I am scared to turn leads away", and bands
  // are the answer to it: a strong lead with one weak answer is flagged, not lost. Put
  // that behind the $79 wall and the $39 plan - the one a nervous first-time buyer picks
  // - is the scary binary version, which is exactly the product nobody configures a real
  // bar on. The upgrade is the ROUTER, not the safety net.
  "gateScoreBands",
  // CONDITIONAL DISQUALIFYING ROUTE (Signal and up): more than one exit from the gate,
  // each named, each with its own Meta event. Score bands are a separate flag above.
  //
  // Gate keeps the gate, its single exit and the bands. What Signal adds is TELLING
  // REJECTIONS APART, which is an ad-account problem: it only starts to pay once
  // somebody is running enough spend to care that their exclusion audience is clean.
  "conditionalExit",
  // Bulk import of a whole assessment from a JSON/CSV export. The plain-text import
  // stays on every tier: writing your own scorecard is the product. Lifting a finished
  // one out of another workspace is an agency motion, so it is priced as one.
  // EXPORT is deliberately NOT gated - a customer's own data must always come out.
  "bulkImport",
] as const;

/**
 * 🟢 FOUR FLAGS DELIBERATELY NOT ADDED - checked, 2026-10-01.
 *
 * The pricing table lists exclusion audiences, the qualified-only optimisation event,
 * first-party match keys and the back-button/repeat lock. Each is ✓ on EVERY tier, and
 * each already runs unconditionally: match keys are built into every CAPI payload by
 * buildUserData, the exclusion/qualified events are emitted by the qualification flow
 * itself, and the repeat lock is a per-assessment retake policy.
 *
 * A flag that is true for every plan is dead code that reads as a real gate - and the
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
  // Score bands ride WITH the gate, for the same reason the gate is in this tier: a
  // gate nobody dares set a real bar on is a gate that does not work, at any price.
  // The upgrade is the router, not the safety net.
  "gateScoreBands",
  "conditionalRouting",
  "capi", // server-side Conversions API - measurement, not a premium add-on
  "pdfReports",
  "webhooks",
  "leadExport",
  "analyticsTracking",
  "staffRoles",
  "prioritySupport",
  // 🔴 customDomain, brandingRemoved and aiReports are NOT here. They were, under the old
  // "every paid plan gets everything everyday" policy, and leaving them meant Gate
  // silently shipped with Signal's entire value - the upgrade had nothing left to sell.
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
   * Ad accounts the tenant may configure. NOT YET ENFORCED - the app has no AdAccount
   * model (docs/FEATURE-GATES.md §8a); a tenant has exactly one Meta config today. The
   * number is carried here so the catalog matches the published pricing and the gate has
   * somewhere to land when the model exists.
   */
  adAccounts: number;
  /**
   * Custom domains this workspace may connect. INCLUDED count only - domains bought on
   * top live on Subscription.extraCustomDomains and are added by the gate, exactly as
   * agency-tenant slots are.
   *
   * 🔴 IT IS A COUNT, NOT A BOOLEAN, AND THE TWO ARE DIFFERENT QUESTIONS. The
   * `customDomain` FEATURE says whether this tier may connect one at all; this says how
   * many. Before it existed, addDomain checked the feature and then nothing, so any
   * Signal-or-above workspace - including a 14-day trial - could add domains without
   * limit, and each one spends a Railway custom-domain slot (3 per service) or a
   * Cloudflare for SaaS custom hostname. That is the same scarce resource the whole
   * Cloudflare for SaaS build exists to ration.
   */
  customDomains: number;
  /**
   * How many AGENCY TENANTS this workspace may own - workspaces that belong to this
   * tenant as an AGENCY ADMIN rather than to the super admin. 0 on every tier that does
   * not resell, which is also what an agency tenant itself resolves, so the hierarchy
   * can never grow a third level.
   *
   * The agency admin's OWN workspace is NOT one of these: it is free and uncounted, and
   * carries the same single-workspace unit every other tenant gets.
   */
  agencyTenants: number;
  features: FeatureFlags;
}

/** Every feature off - the Free baseline; higher tiers switch individual flags on. */
const NO_FEATURES: FeatureFlags = Object.fromEntries(
  FEATURES.map((f) => [f, false]),
) as FeatureFlags;

/** The everyday features on (the "all paid plans get these" set) - the paid baseline. */
const PAID_BASE: FeatureFlags = {
  ...NO_FEATURES,
  ...(Object.fromEntries(PAID_BASE_FEATURES.map((f) => [f, true])) as Partial<FeatureFlags>),
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  // Gate - the differentiator in full, at the smallest volume. Everything the
  // qualification mechanism needs is ON: withholding it here would mean the tier that
  // exists to prove the product cannot demonstrate it.
  GATE: {
    responsesPerMonth: 150,
    maxAssessments: 2,
    seats: 1,
    adAccounts: 1,
    // One, like every tier. What withholds a domain from Gate is the customDomain
    // FEATURE being off, not this number - so comping the feature to a Gate tenant
    // through limitOverrides gives them a usable domain rather than a cap of zero.
    customDomains: 1,
    agencyTenants: 0,
    features: { ...PAID_BASE },
  },
  // Signal - brand, domain, AI and the badge removed.
  SIGNAL: {
    responsesPerMonth: 1000,
    maxAssessments: 10,
    seats: 3,
    adAccounts: 2,
    // One domain per workspace, and Signal IS one workspace (owner, 2026-10-14). The
    // second ad account is for a second brand's pixel, not a second public front door.
    customDomains: 1,
    agencyTenants: 0,
    features: {
      ...PAID_BASE,
      customDomain: true,
      brandingRemoved: true,
      aiReports: true,
      heatmap: true,
      manualReview: true,
      conditionalExit: true,
    },
  },
  // Agency - the agency admin's OWN workspace, plus five agency tenants.
  //
  // 🟢 THE UNIT IS ONE WORKSPACE, set by the owner on 2026-10-13. Every workspace on the
  // install - a tenant under the super admin, an agency admin's own, an agency tenant -
  // gets the same thing: 1,000 responses, one ad account and its pixel, one custom
  // domain, one Razorpay account, ten scorecards, and one user.
  //
  // 🟡 A SEAT IS A USER INSIDE ONE WORKSPACE, never a workspace. `seats: 1` here means
  // the agency admin's own workspace has one login, so the staff helping them share it
  // rather than each getting their own - the owner's call, 2026-10-13. It says nothing
  // about how many workspaces anybody has; that is `agencyTenants` below.
  //
  // What Agency buys is SIX WORKSPACES for
  // $249: the agency admin's own workspace, free and uncounted, and five agency tenants.
  // Beyond five, $29/mo each (Subscription.extraAgencyTenants).
  //
  // So the numbers below describe the agency admin's own workspace only, and they are
  // SMALLER than what this tier published until today (5,000 responses, five ad accounts
  // and unlimited scorecards, all pooled in one workspace). That was the shape of a tier
  // sold to one heavy operator; this is the shape of a tier sold to a reseller, and the
  // total across six workspaces is 6,000 responses and six ad accounts.
  //
  // 🟢 Nobody is re-rated by the reduction: no Agency subscription has ever been
  // charged, and resolvePlan reads the frozen limitsSnapshot for anyone who ever is.
  AGENCY: {
    responsesPerMonth: 1000,
    maxAssessments: 10,
    seats: 1,
    // 🔴 FIVE AD ACCOUNTS AND FIVE CLIENT WORKSPACES ARE TWO DIFFERENT THINGS (owner,
    // 2026-10-14), and the pricing page must name both or a reader takes one "5" for
    // the other. This is the agency admin's OWN workspace running five ad accounts -
    // five clients it buys media for without handing any of them a login. The five
    // client workspaces below are separate businesses with their own logins, pixels and
    // domains. An agency doing both has ten relationships on one subscription.
    adAccounts: 5,
    customDomains: 1,
    agencyTenants: 5,
    features: {
      ...PAID_BASE,
      customDomain: true,
      brandingRemoved: true,
      aiReports: true,
      heatmap: true,
      manualReview: true,
      conditionalExit: true,
      apiAccess: true,
      bulkImport: true,
    },
  },
  // Enterprise - published as "from $599". Real limits come from the per-tenant override
  // resolvePlan already applies, because a flat published number would cap the revenue on
  // the biggest accounts while uncapping their cost.
  ENTERPRISE: {
    // The same one-workspace unit as every other tier (see AGENCY), with twenty agency
    // tenants instead of five. "Unlimited responses" is gone from here for the same
    // reason it is gone from Agency: the volume lives in the workspaces, not in a pool.
    // A negotiated deal is expressed as limitOverrides on the subscription, which is
    // what makes this tier quotable without a second catalog.
    responsesPerMonth: 1000,
    maxAssessments: 10,
    seats: 1,
    // Twenty, mirroring Agency's five: the same two-entitlement shape one tier up.
    // 🟡 The owner set twenty CLIENT WORKSPACES explicitly and did not say a number for
    // ad accounts; this follows the Agency pattern rather than inventing a third shape.
    adAccounts: 20,
    customDomains: 1,
    agencyTenants: 20,
    features: {
      ...PAID_BASE,
      customDomain: true,
      brandingRemoved: true,
      aiReports: true,
      heatmap: true,
      manualReview: true,
      conditionalExit: true,
      apiAccess: true,
      bulkImport: true,
    },
  },
};

/**
 * The plan id an AGENCY TENANT reports. SIGNAL, because that is the retail tier an
 * agency tenant is a discounted copy of ($49.80 inside Agency against $79 retail), so
 * every receipt, meter and label already knows the word. The LIMITS it resolves are
 * AGENCY_TENANT_LIMITS below, NOT PLAN_LIMITS.SIGNAL: an agency tenant gets one ad
 * account and one user, where retail Signal gets two ad accounts and three USERS - three
 * staff logins inside that one workspace, which is what a seat has always meant here.
 */
export const AGENCY_TENANT_PLAN: PlanId = "SIGNAL";

/**
 * What a workspace under an AGENCY ADMIN resolves to - the one-workspace unit the owner
 * set on 2026-10-13: 1,000 responses, one ad account and pixel, one custom domain, one
 * Razorpay account, one login, ten scorecards.
 *
 * Features are Signal's plus bulkImport. The import is what makes the tier work at all:
 * the agency admin builds a scorecard once and lifts it into each agency tenant, so
 * withholding it here would leave the capability on the one workspace that never needs
 * it. apiAccess stays OFF, tokens are the agency admin's surface rather than the agency
 * tenant's.
 *
 * 🔴 CUSTOM DOMAIN IS ON, and that is a deliberate cost. Each agency tenant that uses it
 * spends a custom-hostname slot, so whether an agency gives its agency tenants domains is
 * the AGENCY's decision, not a platform switch. Beyond three hosts this needs Cloudflare
 * for SaaS awake (docs/CUSTOM-DOMAINS.md), or the Railway per-service cap returns.
 *
 * 🟡 No per-tenant override lands here: limitOverrides lives on a Subscription and an
 * agency tenant deliberately has none (one subscription per agency admin). To lift a
 * single agency tenant, use the manual grant (plan + planExpiresAt) or the unlimited flag
 * on its own row - both resolve AHEAD of this.
 */
export const AGENCY_TENANT_LIMITS: PlanLimits = {
  responsesPerMonth: 1000,
  maxAssessments: 10,
  seats: 1,
  adAccounts: 1,
  // 🟢 Its own domain, which is what the $29 (Agency) or $25 (Enterprise) slot buys
  // along with the workspace: the owner's rule is that an extra client workspace
  // carries its domain, and since each one is capped at one here, that falls out of
  // the unit rather than needing a second counter.
  customDomains: 1,
  // An agency tenant can never resell: depth is one, stated here and enforced again in
  // assertCanCreateAgencyTenant.
  agencyTenants: 0,
  features: {
    ...PLAN_LIMITS.SIGNAL.features,
    bulkImport: true,
  },
};

/**
 * Price of one client workspace beyond the plan's included count, USD / month, PER TIER
 * (owner, 2026-10-14). Enterprise buys in bulk, so each extra is cheaper there.
 *
 * The price includes that workspace's own custom domain, because an agency tenant's unit
 * already carries one (AGENCY_TENANT_LIMITS.customDomains). Nothing extra to charge and
 * nothing extra to count.
 *
 * 🔴 A tier that cannot resell has no price here. Reading a number off this map for a
 * tier whose `agencyTenants` is 0 would offer a slot to somebody the gate will refuse.
 */
export const AGENCY_TENANT_EXTRA_USD: Partial<Record<PlanId, number>> = {
  AGENCY: 29,
  ENTERPRISE: 25,
};

/** The price to show when the tier is not known yet. The entry price for reselling. */
export const AGENCY_TENANT_EXTRA_DEFAULT_USD = 29;

/**
 * What ONE extra client workspace costs on a given tier.
 *
 * 🔴 ALWAYS GO THROUGH THIS. Reading the map directly gives `number | undefined`, and
 * the tempting `?? 0` would offer a free workspace on any tier not in it. The fallback
 * is the entry price for reselling, never zero.
 */
export function agencyTenantExtraUsd(plan: PlanId | null): number {
  return (plan ? AGENCY_TENANT_EXTRA_USD[plan] : undefined) ?? AGENCY_TENANT_EXTRA_DEFAULT_USD;
}

/**
 * Price of one custom domain beyond the one every workspace includes, USD / month.
 *
 * 🔴 DECLARED, NOT YET CHARGEABLE. The counter it lands on exists
 * (Subscription.extraCustomDomains) and the gate adds it, but no checkout creates the
 * Razorpay subscription that would collect it - that is the agency-slot build again, and
 * it is deliberately a separate pass. Until it exists the pricing page says "on
 * request", because a published price nobody can pay is the defect this number is
 * supposed to prevent, not create.
 */
export const EXTRA_CUSTOM_DOMAIN_USD = 5;

/** Monthly USD price per plan (machine value; content.ts holds the display string). */
export const PLAN_PRICE_USD: Record<PlanId, number> = {
  GATE: 39,
  SIGNAL: 79,
  AGENCY: 249,
  ENTERPRISE: 599,
};

/**
 * Annual price PER MONTH (billed yearly). Enterprise is quoted, never published.
 *
 * 🔴 PER MONTH, NOT PER YEAR. $32 is what a Gate customer on the annual term pays per
 * month; the card is charged 32 x 12 = $384 once. Reading this as the yearly figure
 * undercharges by a factor of twelve, which is why nothing multiplies it by hand - every
 * caller goes through `chargeUsd` below.
 */
export const PLAN_PRICE_USD_ANNUAL: Record<PlanId, number | null> = {
  GATE: 32,
  SIGNAL: 69,
  AGENCY: 219,
  ENTERPRISE: null,
};

export const MONTHS_PER_YEAR = 12;

/**
 * How often a subscription is charged. Stored on Subscription.term, carried in the
 * Razorpay subscription's notes, and byte-identical to the Prisma `BillingTerm` enum so
 * the two are interchangeable without a cast.
 */
export const BILLING_TERMS = ["MONTHLY", "YEARLY"] as const;
export type BillingTerm = (typeof BILLING_TERMS)[number];

export function isBillingTerm(value: unknown): value is BillingTerm {
  return typeof value === "string" && (BILLING_TERMS as readonly string[]).includes(value);
}

/** Human label for a term, for buttons and receipts. */
export const TERM_LABEL: Record<BillingTerm, string> = {
  MONTHLY: "monthly",
  YEARLY: "yearly",
};

/**
 * WHAT THE CARD IS CHARGED PER CYCLE, in whole USD. The one answer to that question.
 *
 * 🔴 Every amount that reaches Razorpay, the Payment ledger or a Meta Purchase value goes
 * through here. Before annual existed those three all read PLAN_PRICE_USD directly, which
 * on a yearly charge would have reported $32 against a $384 payment: a ledger that does
 * not reconcile, and a conversion value one twelfth of reality teaching the ad account
 * that a subscriber is worth $32.
 *
 * Null only for a tier with no published annual price - Enterprise, which is quoted and
 * never charged through this flow at all. Callers that know they hold a chargeable tier
 * should refuse rather than fall back to a number, because every fallback here is the
 * wrong price.
 */
export function chargeUsd(plan: PlanId, term: BillingTerm): number | null {
  if (term === "MONTHLY") return PLAN_PRICE_USD[plan];
  const perMonth = PLAN_PRICE_USD_ANNUAL[plan];
  return perMonth === null ? null : perMonth * MONTHS_PER_YEAR;
}

/** What a yearly buyer saves against twelve monthly charges, in whole USD. */
export function annualSavingUsd(plan: PlanId): number | null {
  const yearly = chargeUsd(plan, "YEARLY");
  return yearly === null ? null : PLAN_PRICE_USD[plan] * MONTHS_PER_YEAR - yearly;
}

/** The plan a trial grants, and how long it runs. */
export const TRIAL_PLAN: PlanId = "SIGNAL";
export const TRIAL_DAYS = 14;

/**
 * Agency tenants a TRIALING workspace may create. One, so somebody evaluating Agency can
 * see the thing they are being asked to pay for rather than read about it.
 *
 * 🟡 Worth knowing before raising it: there is ONE trial and it grants Signal, so this
 * reaches EVERY trialing workspace, not only the ones that intend to buy Agency. That is
 * the trade - a nudge toward the tier for everyone, against a tier nobody can evaluate.
 */
export const TRIAL_AGENCY_TENANTS = 1;

/**
 * What a trial actually resolves to: the trial plan's catalog entry, with the one agency
 * tenant added. Separate constant so the trial's allowance is stated once, instead of
 * each gate remembering to special-case a trialing caller.
 */
export const TRIAL_LIMITS: PlanLimits = {
  ...PLAN_LIMITS[TRIAL_PLAN],
  agencyTenants: TRIAL_AGENCY_TENANTS,
};

/** Human label per plan, for meters/receipts/UI. */
export const PLAN_LABEL: Record<PlanId, string> = {
  GATE: "Gate",
  SIGNAL: "Signal",
  AGENCY: "Agency",
  ENTERPRISE: "Enterprise",
};

/**
 * The paid tiers, named, for a refusal that lists them.
 *
 * 🔴 DERIVED, NEVER TYPED OUT. The sentence a customer met when they picked no plan read
 * "Pick a paid plan (Starter, Growth, or Scale)" for months after those tiers were
 * retired - three plans that do not exist, shown at the moment somebody was deciding
 * whether to pay. Hard-coding the names is what let the catalog move without it.
 */
export const PAID_PLAN_NAMES: string = PLAN_IDS.map((id) => PLAN_LABEL[id]).join(", ");

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
  // Same reason as adAccounts: snapshots frozen before domains were counted carry no
  // such field, and rejecting them would re-rate that customer to the catalog.
  customDomains: z.number().int().nonnegative().default(1),
  // Same reason as adAccounts above: snapshots frozen before agency tenants existed
  // carry no such field, and rejecting them would re-rate that customer.
  agencyTenants: z.number().int().nonnegative().default(0),
  features: featureFlagsSchema,
});

/** Partial overrides - any subset of PlanLimits fields; features may be partial too. */
export const planLimitsOverrideSchema = z
  .object({
    responsesPerMonth: z.number().int().nonnegative().nullable(),
    maxAssessments: z.number().int().nonnegative().nullable(),
    seats: z.number().int().positive(),
    adAccounts: z.number().int().nonnegative(),
    customDomains: z.number().int().nonnegative(),
    agencyTenants: z.number().int().nonnegative(),
    features: z.record(z.enum(FEATURES), z.boolean()),
  })
  .partial();

export type PlanLimitsOverride = z.infer<typeof planLimitsOverrideSchema>;

/**
 * Parse a stored snapshot (Json) into PlanLimits. NEVER throws - a corrupt/absent
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
    customDomains: o.customDomains !== undefined ? o.customDomains : base.customDomains,
    agencyTenants: o.agencyTenants !== undefined ? o.agencyTenants : base.agencyTenants,
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

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * The usage-period key for RESPONSES metering. A paid tenant meters against its billing
 * period (keyed by the period-start date, "YYYY-MM-DD"); a tenant with no period start
 * meters against the calendar month. Pure.
 *
 * 🔴 THE ALLOWANCE IS MONTHLY ON EVERY TERM. "150 qualified responses / month" is what
 * the page sells, so a yearly subscriber gets 150 a month and not 150 a year. Razorpay
 * rewrites currentPeriodStart once per CHARGE, which on a yearly subscription is once
 * per year, so keying off it directly would hold one key for twelve months and the
 * counter would never roll over. For YEARLY the window is therefore stepped forward in
 * whole months from the period start (monthlyWindowStart, which reuses the renewal
 * clamp), and it keeps rolling over on time even if no webhook ever lands again.
 *
 * MONTHLY is untouched: its period start already moves every cycle, and deriving windows
 * for it would replace a fact from the provider with arithmetic of our own.
 */
export function usagePeriodKey(
  periodStart: Date | null,
  now: Date,
  term: BillingTerm = "MONTHLY",
): string {
  if (!periodStart) return calendarMonthKey(now);
  if (term === "YEARLY") return dayKey(monthlyWindowStart(periodStart, now));
  return dayKey(periodStart);
}

/**
 * PARKED limits - a lapsed trial or subscription.
 *
 * 🔴 Everything off, zero volume. The first version of this returned the GATE catalog
 * alongside `parked: true`, and every gate in the app reads LIMITS, not the flag - so a
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
  customDomains: 0,
  agencyTenants: 0,
  features: { ...NO_FEATURES },
};

/** Unlimited limits - the platform/Gita tenant and any internal/unmetered scope. */
export const UNLIMITED_LIMITS: PlanLimits = {
  responsesPerMonth: null,
  maxAssessments: null,
  adAccounts: Number.MAX_SAFE_INTEGER,
  customDomains: Number.MAX_SAFE_INTEGER,
  seats: Number.MAX_SAFE_INTEGER,
  agencyTenants: Number.MAX_SAFE_INTEGER,
  features: Object.fromEntries(FEATURES.map((f) => [f, true])) as FeatureFlags,
};

// --- Trial / parked presentation --------------------------------------------

/**
 * Whole days left in a trial, from `trialEndsAt`. Pure, so the banner, the billing
 * page and `verify:billing` all agree on the number.
 *
 * CEILING, not floor: with 30 minutes left the honest answer is "1 day", not "0 days"
 * - a zero would read as already-ended while the tenant still has full Signal
 * entitlements, which is the opposite of the truth. 0 is reserved for an expired or
 * absent trial, i.e. exactly the states `resolvePlan` reports as parked.
 */
export function trialDaysLeft(trialEndsAt: Date | null, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  const ms = trialEndsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * The one sentence a parked tenant is told, wherever a gate stops them.
 *
 * Why a constant and not a helper that builds an error object: the previous attempt
 * (`parkedDenied()`) shipped with zero callers because expressing parked AS LIMITS
 * meant no mutation needed a bespoke check. What the limits CANNOT carry is the
 * reason - a parked tenant hitting `maxAssessments: 0` was told "your plan's limit of
 * 0 assessments", which reads as a billing bug. So the gates that have a parked-aware
 * message to give import this string; nothing else changes.
 */
export const PARKED_MESSAGE =
  "Your trial has ended and this workspace is paused. Nothing was deleted - pick a plan and everything resumes exactly where it left off.";
