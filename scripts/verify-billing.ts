/**
 * verify:billing - Phase 1 billing entitlement checks.
 *
 * Exercises the PURE plan/limit helpers (src/lib/billing/plans.ts) - no DB, so it
 * runs anywhere (staging DB is unreachable locally, see the db-internal-only note).
 * The DB-touching resolvers (entitlements.ts) are validated on staging in Phase 2.
 *
 * Run: npm run verify:billing
 */
import { readFileSync } from "fs";
import { join } from "path";
import { type Plan } from "@prisma/client";
import { grantedPlan } from "../src/lib/billing/plan-resolve";
import {
  PLAN_IDS,
  PLAN_LIMITS,
  PLAN_PRICE_USD,
  PAID_BASE_FEATURES,
  UNLIMITED_LIMITS,
  FEATURES,
  applyOverrides,
  calendarMonthKey,
  hasFeature,
  isOverLimit,
  isUnlimited,
  limitsForPlan,
  parseLimitsSnapshot,
  usageFraction,
  usagePeriodKey,
  trialDaysLeft,
  PARKED_LIMITS,
  TRIAL_PLAN,
  TRIAL_DAYS,
  TRIAL_LIMITS,
  TRIAL_AGENCY_TENANTS,
  AGENCY_TENANT_LIMITS,
  AGENCY_TENANT_PLAN,
  AGENCY_TENANT_EXTRA_USD,
  type Feature,
  type PlanLimits,
} from "../src/lib/billing/plans";

// Capabilities Signal adds on top of Gate.
const SIGNAL_CAPS: Feature[] = ["customDomain", "brandingRemoved", "aiReports", "heatmap", "manualReview"];

let failed = 0;
/** `why` is printed only on failure: a check that fails without saying what it was
 *  protecting is a check the next person deletes. */
function check(name: string, cond: boolean, why?: string): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${why ? `
       ${why}` : ""}`);
  }
}

console.log("Billing - plan catalog (Gate / Signal / Agency / Enterprise)");
check("Gate = 150 responses / 2 scorecards / 1 seat / 1 ad account",
  PLAN_LIMITS.GATE.responsesPerMonth === 150 && PLAN_LIMITS.GATE.maxAssessments === 2 &&
  PLAN_LIMITS.GATE.seats === 1 && PLAN_LIMITS.GATE.adAccounts === 1);
check("Signal = 1000 / 10 / 3 / 2",
  PLAN_LIMITS.SIGNAL.responsesPerMonth === 1000 && PLAN_LIMITS.SIGNAL.maxAssessments === 10 &&
  PLAN_LIMITS.SIGNAL.seats === 3 && PLAN_LIMITS.SIGNAL.adAccounts === 2);
check("Agency = the one-workspace unit (1000 / 10 scorecards / 1 user / 1 ad account)",
  PLAN_LIMITS.AGENCY.responsesPerMonth === 1000 && PLAN_LIMITS.AGENCY.maxAssessments === 10 &&
  PLAN_LIMITS.AGENCY.seats === 1 && PLAN_LIMITS.AGENCY.adAccounts === 1,
  "Agency buys SIX workspaces of this unit, not one big workspace. The count is agencyTenants.");
check("Enterprise = the same unit, twenty agency tenants",
  PLAN_LIMITS.ENTERPRISE.responsesPerMonth === 1000 && PLAN_LIMITS.ENTERPRISE.maxAssessments === 10 &&
  PLAN_LIMITS.ENTERPRISE.agencyTenants === 20,
  "A negotiated deal is limitOverrides on the subscription, not a second catalog.");

console.log("Agency tenants (a workspace under an agency admin)");
// 🔴 The whole tier rests on these four numbers. Reselling is a COUNT on the agency
// admin's plan, and anything above zero on a tier that cannot resell hands away free
// workspaces - which is why Gate and Signal are asserted at zero rather than left alone.
check("Agency includes 5 agency tenants, Enterprise 20", PLAN_LIMITS.AGENCY.agencyTenants === 5 && PLAN_LIMITS.ENTERPRISE.agencyTenants === 20);
check("Gate and Signal resell nothing",
  PLAN_LIMITS.GATE.agencyTenants === 0 && PLAN_LIMITS.SIGNAL.agencyTenants === 0,
  "A non-zero count here is five free workspaces on a $39 plan.");
check("an agency tenant is the same one-workspace unit",
  AGENCY_TENANT_LIMITS.responsesPerMonth === 1000 && AGENCY_TENANT_LIMITS.maxAssessments === 10 &&
  AGENCY_TENANT_LIMITS.seats === 1 && AGENCY_TENANT_LIMITS.adAccounts === 1);
check("an agency tenant can never resell (depth is one)",
  AGENCY_TENANT_LIMITS.agencyTenants === 0,
  "Non-zero here grows a third level the billing model cannot express.");
check("an agency tenant keeps the custom domain and the badge off",
  hasFeature(AGENCY_TENANT_LIMITS, "customDomain") && hasFeature(AGENCY_TENANT_LIMITS, "brandingRemoved"),
  "Whether an agency gives its agency tenants domains is the AGENCY's call - the capability has to be there to decline.");
check("an agency tenant can take a finished scorecard (bulkImport)",
  hasFeature(AGENCY_TENANT_LIMITS, "bulkImport"),
  "Build once, lift into each workspace. Without it the tier has no agency motion.");
check("an agency tenant gets no API tokens",
  !hasFeature(AGENCY_TENANT_LIMITS, "apiAccess"),
  "Tokens are the agency admin's surface, not the agency tenant's.");
check("an agency tenant reports a real plan id", PLAN_IDS.includes(AGENCY_TENANT_PLAN));
check("a trial can create exactly one agency tenant",
  TRIAL_LIMITS.agencyTenants === TRIAL_AGENCY_TENANTS && TRIAL_AGENCY_TENANTS === 1,
  "Zero means nobody can evaluate the tier; more than one is a free Agency account.");
check("the trial changes NOTHING else about the trial plan",
  TRIAL_LIMITS.responsesPerMonth === PLAN_LIMITS[TRIAL_PLAN].responsesPerMonth &&
  TRIAL_LIMITS.adAccounts === PLAN_LIMITS[TRIAL_PLAN].adAccounts);
check("an extra agency tenant has a price", AGENCY_TENANT_EXTRA_USD === 29);
check("a snapshot without agencyTenants still parses (pre-agency customers)",
  parseLimitsSnapshot({ responsesPerMonth: 1000, maxAssessments: 10, seats: 3, adAccounts: 2, features: PLAN_LIMITS.SIGNAL.features }, "SIGNAL").agencyTenants === 0,
  "Rejecting an old snapshot re-rates that customer to the catalog.");
check("an override can lift the agency-tenant count",
  applyOverrides(PLAN_LIMITS.AGENCY, { agencyTenants: 40 }).agencyTenants === 40);

console.log("Prices match the published pricing page");
check("Gate 39 / Signal 79 / Agency 249 / Enterprise 599",
  PLAN_PRICE_USD.GATE === 39 && PLAN_PRICE_USD.SIGNAL === 79 &&
  PLAN_PRICE_USD.AGENCY === 249 && PLAN_PRICE_USD.ENTERPRISE === 599);

console.log("Feature gates - the differentiator ships in the ENTRY tier");
// This is the whole pricing thesis: a qualification gate behind a $79 wall is a gate the
// buyer never experiences before deciding. If this check ever fails, the pricing page and
// the product disagree about what $39 buys.
check("Gate has the qualification gate, routing and CAPI",
  hasFeature(PLAN_LIMITS.GATE, "qualificationGate") &&
  hasFeature(PLAN_LIMITS.GATE, "conditionalRouting") &&
  hasFeature(PLAN_LIMITS.GATE, "capi"));
check("Gate has every paid-base feature", PAID_BASE_FEATURES.every((f) => hasFeature(PLAN_LIMITS.GATE, f)));
check("Gate does NOT have the Signal caps", SIGNAL_CAPS.every((f) => !hasFeature(PLAN_LIMITS.GATE, f)));
check("Signal has every Signal cap", SIGNAL_CAPS.every((f) => hasFeature(PLAN_LIMITS.SIGNAL, f)));
check("Signal has no API access", !hasFeature(PLAN_LIMITS.SIGNAL, "apiAccess"));
check("Agency has API access", hasFeature(PLAN_LIMITS.AGENCY, "apiAccess"));
check("Every tier grants every tier below it",
  FEATURES.every((f) => !hasFeature(PLAN_LIMITS.GATE, f) || hasFeature(PLAN_LIMITS.SIGNAL, f)) &&
  FEATURES.every((f) => !hasFeature(PLAN_LIMITS.SIGNAL, f) || hasFeature(PLAN_LIMITS.AGENCY, f)));

console.log("Snapshots + overrides");
check("A snapshot without adAccounts still parses (pre-ad-account customers)",
  parseLimitsSnapshot({ responsesPerMonth: 150, maxAssessments: 2, seats: 1, features: PLAN_LIMITS.GATE.features }, "GATE").seats === 1);
check("Overrides win over the catalog",
  applyOverrides(PLAN_LIMITS.GATE, { responsesPerMonth: 9999 }).responsesPerMonth === 9999);
check("Unlimited limits are unlimited",
  isUnlimited(UNLIMITED_LIMITS.responsesPerMonth) && isUnlimited(UNLIMITED_LIMITS.maxAssessments));
check("limitsForPlan returns the catalog entry", limitsForPlan("SIGNAL").seats === 3);

console.log("Usage helpers");
check("isOverLimit", isOverLimit(150, 150) && !isOverLimit(149, 150) && !isOverLimit(1e9, null));
check("usageFraction", usageFraction(75, 150) === 0.5 && usageFraction(5, null) === 0);
check("calendar period key", calendarMonthKey(new Date("2026-10-01T00:00:00Z")).startsWith("2026-10"));
check("usagePeriodKey falls back to the calendar month",
  usagePeriodKey(null, new Date("2026-10-01T00:00:00Z")) === calendarMonthKey(new Date("2026-10-01T00:00:00Z")));

console.log("Trial");
// The trial grants SIGNAL, not GATE: a trial of the cheap tier cannot demonstrate the
// features the ladder is selling, and the tenant would judge the product on less than
// they were shown on the pricing page.
check("the trial grants Signal for 14 days", TRIAL_PLAN === "SIGNAL" && TRIAL_DAYS === 14);
{
  const end = new Date("2026-10-15T00:00:00Z");
  check("14 whole days left reads as 14", trialDaysLeft(end, new Date("2026-10-01T00:00:00Z")) === 14);
  // CEILING, not floor. With 30 minutes left the tenant still holds full Signal
  // entitlements, so "0 days" would announce an end that has not happened - and 0 is the
  // value the banner and the billing page treat as parked.
  check("a part-day left reads as 1, never 0", trialDaysLeft(end, new Date("2026-10-14T23:30:00Z")) === 1);
  check("an expired trial reads as 0", trialDaysLeft(end, new Date("2026-10-15T00:00:01Z")) === 0);
  check("no trial reads as 0", trialDaysLeft(null, new Date("2026-10-01T00:00:00Z")) === 0);
}

console.log("Parked (lapsed trial / lapsed subscription)");
// Parked is expressed AS LIMITS so that every gate in the app enforces it without
// knowing the word "parked". If any of these drift back to a catalog value, a lapsed
// tenant silently keeps the tier they stopped paying for.
check("parked = zero responses, zero scorecards, zero ad accounts",
  PARKED_LIMITS.responsesPerMonth === 0 && PARKED_LIMITS.maxAssessments === 0 &&
  PARKED_LIMITS.adAccounts === 0);
check("parked grants NO feature at all", FEATURES.every((f) => !hasFeature(PARKED_LIMITS, f)));
// The funnel route and startSubmission both branch on `parked`, not on these numbers -
// because a limit of 0 means capture-but-lock (store the lead, withhold the result),
// which is right for an over-cap payer and wrong for a tenant with no plan.
check("parked is over limit at the very first response", isOverLimit(0, PARKED_LIMITS.responsesPerMonth));
check("parked keeps one seat, so the owner can still sign in and pay", PARKED_LIMITS.seats === 1);
// The READ path must never use the 0 above: `resolvePlan` exposes `readResponseLimit`,
// frozen at the last entitling plan, so parking hides nothing the tenant had earned. For
// a lapsed TRIAL that frozen value is the trial's own allowance - which therefore has to
// be a real number, not 0, or a lapsed trial empties its own workspace.
// null (unlimited) and any positive number both pass; only a literal 0 fails.
check("a lapsed trial's leads stay readable (trial allowance is non-zero)",
  PLAN_LIMITS[TRIAL_PLAN].responsesPerMonth !== 0);

console.log("Manual access grant (owner extends a trial or comps an account)");
// The date is what makes a grant. Every tenant row carries plan GATE by default, so a
// plan with no date must entitle NOBODY - otherwise adding this column would have
// handed a paid plan to every parked workspace on the install.
const DAY = 24 * 60 * 60 * 1000;
const future = new Date(Date.now() + 10 * DAY);
const past = new Date(Date.now() - DAY);
check("no date means no grant, whatever the plan says", grantedPlan("SIGNAL" as Plan, null) === null);
check("a future date grants that plan", grantedPlan("SIGNAL" as Plan, future) === "SIGNAL");
check("an expired date grants nothing", grantedPlan("SIGNAL" as Plan, past) === null);
check("the grant is the plan named, not a fixed tier", grantedPlan("AGENCY" as Plan, future) === "AGENCY");
// A grant entitles the catalog limits of that plan - the same object a payer gets, so
// a comped Agency account and a paying one cannot drift apart.
check(
  "a granted plan carries that plan's real limits",
  PLAN_LIMITS[grantedPlan("AGENCY" as Plan, future) as "AGENCY"].responsesPerMonth ===
    PLAN_LIMITS.AGENCY.responsesPerMonth,
);

/* ---------------------------------------------------------------------------
 * The published claims, checked against the product
 *
 * 🔴 WHY A SOURCE SCAN LIVES IN THE BILLING CHECKS. Every other check here proves the
 * catalog is self-consistent. None of them could catch the thing that was actually
 * wrong: the pricing page sold client sub-accounts (no code anywhere), white-label
 * (which is Signal's custom domain and badge removal, sold back at $199) and metered
 * overage (no code ever charged it - going over runs capture-but-lock). Corrected
 * 2026-10-13. A claim is only safe while something fails when it comes back.
 * ------------------------------------------------------------------------- */
console.log("Published claims match the product");
const marketing = readFileSync(join(__dirname, "..", "src/lib/marketing/content.ts"), "utf8");
// Comments explaining the removal are allowed; a claim in the tier/matrix data is not.
const claimLines = marketing
  .split(/\r?\n/)
  .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
const claims = claimLines.join("\n");

// Agency tenants ARE built now (2026-10-13), so the prohibition became a TIE: the page
// may say it only while the catalog grants it and the cap exists in code. The old
// no-sub-accounts check is kept in spirit under its own name below - the words
// "sub-account" stay banned, because that is not what this is called.
check("the page does not call them sub-accounts", !/sub-account/i.test(claims),
  "The vocabulary is agency admin / agency tenant. One name, in copy and in code.");
const sellsAgencyTenants = /agency tenant/i.test(claims);
check("agency tenants are only sold while the catalog grants them",
  !sellsAgencyTenants || PLAN_LIMITS.AGENCY.agencyTenants > 0,
  "Copy first, feature later, is how the sub-account claim got onto the page the first time.");
const gateSrc = readFileSync(join(__dirname, "..", "src/lib/billing/gate.ts"), "utf8");
check("agency tenants are only sold while something enforces the count",
  !sellsAgencyTenants || /assertCanCreateAgencyTenant/.test(gateSrc),
  "A published count nobody checks is a price list that does not describe the product.");
check("the page does not price the extras before the slot can be bought",
  !/\$29/.test(claims) || /razorpaySlotSubscriptionId/.test(readFileSync(join(__dirname, "..", "prisma/schema.prisma"), "utf8")),
  "Naming a price for an extra workspace needs the purchased counter AND the charge path.");
check("the pricing page does not sell white-label", !/white.?label/i.test(claims),
  "Custom domain + badge removal ARE white-label, and they are Signal's.");
check("no plan advertises a general API", !/"API access"/.test(claims),
  "The surface is scoped tokens for two conversion endpoints - say that instead.");
check("the overage note does not promise a price", !/\$15 per extra/.test(claims),
  "Over the cap the app runs capture-but-lock; it charges nothing.");
check("no tier sells per-account overage", !/ad accounts \$15/i.test(claims),
  "The add-on needs an additive purchased counter and a payment that has actually run.");
// The flag the deleted claim would have needed. If somebody adds it to the catalog
// without building the feature, this fails before the copy can follow it back.
check("reselling is a COUNT, not a feature flag", !FEATURES.includes("subAccounts" as never) && !FEATURES.includes("agencyTenants" as never),
  "It is PlanLimits.agencyTenants - a number the gate counts against, not a boolean.");

const unusedType: PlanLimits = PLAN_LIMITS.GATE;
void unusedType;

if (failed > 0) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log("All billing checks passed.");
