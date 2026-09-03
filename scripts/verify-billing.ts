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
  type PlanLimits,
} from "../src/lib/billing/plans";

let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}`);
  }
}

console.log("Phase 1 billing — plan catalog");
// Limits mirror the live marketing tiers.
check("Free = 25 responses / 1 assessment / 1 seat",
  PLAN_LIMITS.FREE.responsesPerMonth === 25 && PLAN_LIMITS.FREE.maxAssessments === 1 && PLAN_LIMITS.FREE.seats === 1);
check("Starter = 300 / 3 / 1",
  PLAN_LIMITS.STARTER.responsesPerMonth === 300 && PLAN_LIMITS.STARTER.maxAssessments === 3 && PLAN_LIMITS.STARTER.seats === 1);
check("Growth = 2000 / 15 / 3",
  PLAN_LIMITS.GROWTH.responsesPerMonth === 2000 && PLAN_LIMITS.GROWTH.maxAssessments === 15 && PLAN_LIMITS.GROWTH.seats === 3);
check("Scale = 12000 / unlimited assessments / 5 seats",
  PLAN_LIMITS.SCALE.responsesPerMonth === 12000 && isUnlimited(PLAN_LIMITS.SCALE.maxAssessments) && PLAN_LIMITS.SCALE.seats === 5);

console.log("Feature gates");
check("Free grants no features", FEATURES.every((f) => !hasFeature(PLAN_LIMITS.FREE, f)));
check("Starter: pdfReports yes, customDomain no",
  hasFeature(PLAN_LIMITS.STARTER, "pdfReports") && !hasFeature(PLAN_LIMITS.STARTER, "customDomain"));
check("Growth: customDomain yes, apiAccess no",
  hasFeature(PLAN_LIMITS.GROWTH, "customDomain") && !hasFeature(PLAN_LIMITS.GROWTH, "apiAccess"));
check("Scale: apiAccess + aiReports + staffRoles yes",
  hasFeature(PLAN_LIMITS.SCALE, "apiAccess") && hasFeature(PLAN_LIMITS.SCALE, "aiReports") && hasFeature(PLAN_LIMITS.SCALE, "staffRoles"));
check("higher tiers are supersets of lower",
  FEATURES.every((f) => !hasFeature(PLAN_LIMITS.STARTER, f) || hasFeature(PLAN_LIMITS.GROWTH, f)) &&
  FEATURES.every((f) => !hasFeature(PLAN_LIMITS.GROWTH, f) || hasFeature(PLAN_LIMITS.SCALE, f)));

console.log("Limit math");
check("isOverLimit: 25/25 over, 24/25 not", isOverLimit(25, 25) && !isOverLimit(24, 25));
check("isOverLimit: unlimited never over", !isOverLimit(1_000_000, null));
check("usageFraction: 15/300 = 0.05", Math.abs(usageFraction(15, 300) - 0.05) < 1e-9);
check("usageFraction: unlimited = 0", usageFraction(999, null) === 0);
check("limitsForPlan(GROWTH) === PLAN_LIMITS.GROWTH", limitsForPlan("GROWTH") === PLAN_LIMITS.GROWTH);

console.log("Snapshot parse (never throws)");
const validSnap = PLAN_LIMITS.GROWTH;
check("valid snapshot round-trips", JSON.stringify(parseLimitsSnapshot(validSnap, "GROWTH")) === JSON.stringify(validSnap));
check("corrupt snapshot falls back to plan default",
  JSON.stringify(parseLimitsSnapshot({ garbage: true }, "STARTER")) === JSON.stringify(PLAN_LIMITS.STARTER));
check("null snapshot falls back to plan default",
  JSON.stringify(parseLimitsSnapshot(null, "FREE")) === JSON.stringify(PLAN_LIMITS.FREE));

console.log("Overrides");
const bumped = applyOverrides(PLAN_LIMITS.STARTER, { responsesPerMonth: 500 });
check("override raises one field, keeps the rest", bumped.responsesPerMonth === 500 && bumped.maxAssessments === 3);
const feat = applyOverrides(PLAN_LIMITS.STARTER, { features: { customDomain: true } });
check("override merges a single feature flag", hasFeature(feat, "customDomain") && hasFeature(feat, "pdfReports"));
check("override to unlimited assessments", applyOverrides(PLAN_LIMITS.STARTER, { maxAssessments: null }).maxAssessments === null);
const bad: PlanLimits = applyOverrides(PLAN_LIMITS.FREE, "not-an-object");
check("bad override returns base unchanged", JSON.stringify(bad) === JSON.stringify(PLAN_LIMITS.FREE));

console.log("Period keys");
check("calendarMonthKey pads month", calendarMonthKey(new Date(Date.UTC(2026, 2, 9))) === "2026-03");
check("Free tenant → calendar month key", usagePeriodKey(null, new Date(Date.UTC(2026, 8, 3))) === "2026-09");
check("paid tenant → period-start key", usagePeriodKey(new Date(Date.UTC(2026, 8, 3)), new Date(Date.UTC(2026, 8, 20))) === "2026-09-03");

console.log("Platform (unlimited) scope");
check("UNLIMITED grants every feature", FEATURES.every((f) => hasFeature(UNLIMITED_LIMITS, f)));
check("UNLIMITED caps are null", isUnlimited(UNLIMITED_LIMITS.responsesPerMonth) && isUnlimited(UNLIMITED_LIMITS.maxAssessments));

console.log("");
if (failed > 0) {
  console.error(`verify:billing — ${failed} check(s) FAILED`);
  process.exit(1);
}
console.log("verify:billing — all checks passed");
