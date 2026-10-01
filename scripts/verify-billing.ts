/**
 * verify:billing — Phase 1 billing entitlement checks.
 *
 * Exercises the PURE plan/limit helpers (src/lib/billing/plans.ts) — no DB, so it
 * runs anywhere (staging DB is unreachable locally, see the db-internal-only note).
 * The DB-touching resolvers (entitlements.ts) are validated on staging in Phase 2.
 *
 * Run: npm run verify:billing
 */
import {
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
  type Feature,
  type PlanLimits,
} from "../src/lib/billing/plans";

// Capabilities Signal adds on top of Gate.
const SIGNAL_CAPS: Feature[] = ["customDomain", "brandingRemoved", "aiReports", "heatmap", "manualReview"];

let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}`);
  }
}

console.log("Billing — plan catalog (Gate / Signal / Agency / Enterprise)");
check("Gate = 150 responses / 2 scorecards / 1 seat / 1 ad account",
  PLAN_LIMITS.GATE.responsesPerMonth === 150 && PLAN_LIMITS.GATE.maxAssessments === 2 &&
  PLAN_LIMITS.GATE.seats === 1 && PLAN_LIMITS.GATE.adAccounts === 1);
check("Signal = 1000 / 10 / 3 / 2",
  PLAN_LIMITS.SIGNAL.responsesPerMonth === 1000 && PLAN_LIMITS.SIGNAL.maxAssessments === 10 &&
  PLAN_LIMITS.SIGNAL.seats === 3 && PLAN_LIMITS.SIGNAL.adAccounts === 2);
check("Agency = 5000 / unlimited scorecards / 10 seats / 10 ad accounts",
  PLAN_LIMITS.AGENCY.responsesPerMonth === 5000 && isUnlimited(PLAN_LIMITS.AGENCY.maxAssessments) &&
  PLAN_LIMITS.AGENCY.seats === 10 && PLAN_LIMITS.AGENCY.adAccounts === 10);
check("Enterprise = unlimited responses + unlimited scorecards",
  isUnlimited(PLAN_LIMITS.ENTERPRISE.responsesPerMonth) && isUnlimited(PLAN_LIMITS.ENTERPRISE.maxAssessments));

console.log("Prices match the published pricing page");
check("Gate 39 / Signal 79 / Agency 199 / Enterprise 499",
  PLAN_PRICE_USD.GATE === 39 && PLAN_PRICE_USD.SIGNAL === 79 &&
  PLAN_PRICE_USD.AGENCY === 199 && PLAN_PRICE_USD.ENTERPRISE === 499);

console.log("Feature gates — the differentiator ships in the ENTRY tier");
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

const unusedType: PlanLimits = PLAN_LIMITS.GATE;
void unusedType;

if (failed > 0) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log("All billing checks passed.");
