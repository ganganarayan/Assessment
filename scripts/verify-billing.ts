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

// The five tier-gated capabilities (everything NOT in the paid-base everyday set).
const GROWTH_CAPS: Feature[] = ["qualificationGate", "conditionalRouting", "capi", "heatmap"];

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

console.log("Feature gates (volume-first: paid plans share every everyday feature; 5 caps gated)");
check("Free grants no features", FEATURES.every((f) => !hasFeature(PLAN_LIMITS.FREE, f)));
// Every PAID plan carries the full everyday set — including custom domain, branding
// removed, AI reports, staff roles (the ones that used to be Growth/Scale-only).
check("Starter has EVERY everyday feature",
  PAID_BASE_FEATURES.every((f) => hasFeature(PLAN_LIMITS.STARTER, f)));
check("Starter: customDomain + brandingRemoved + aiReports + staffRoles now yes",
  hasFeature(PLAN_LIMITS.STARTER, "customDomain") && hasFeature(PLAN_LIMITS.STARTER, "brandingRemoved") &&
  hasFeature(PLAN_LIMITS.STARTER, "aiReports") && hasFeature(PLAN_LIMITS.STARTER, "staffRoles"));
check("Starter has NONE of the 5 gated caps",
  GROWTH_CAPS.every((f) => !hasFeature(PLAN_LIMITS.STARTER, f)) && !hasFeature(PLAN_LIMITS.STARTER, "apiAccess"));
check("Growth adds the 4 Growth caps (qualification, routing, capi, heatmap)",
  GROWTH_CAPS.every((f) => hasFeature(PLAN_LIMITS.GROWTH, f)));
check("Growth still WITHOUT apiAccess", !hasFeature(PLAN_LIMITS.GROWTH, "apiAccess"));
check("Scale is the only plan with apiAccess",
  hasFeature(PLAN_LIMITS.SCALE, "apiAccess") &&
  !hasFeature(PLAN_LIMITS.FREE, "apiAccess") && !hasFeature(PLAN_LIMITS.STARTER, "apiAccess") && !hasFeature(PLAN_LIMITS.GROWTH, "apiAccess"));
check("Scale grants every feature", FEATURES.every((f) => hasFeature(PLAN_LIMITS.SCALE, f)));
check("higher tiers are supersets of lower",
  FEATURES.every((f) => !hasFeature(PLAN_LIMITS.STARTER, f) || hasFeature(PLAN_LIMITS.GROWTH, f)) &&
  FEATURES.every((f) => !hasFeature(PLAN_LIMITS.GROWTH, f) || hasFeature(PLAN_LIMITS.SCALE, f)));

console.log("Response cap lock rule (periodSeq > CURRENT limit; null seq never locked)");
// Pure mirror of gate.isResponseLocked's predicate — proves the capture-but-lock math.
const lockedBySeq = (seq: number | null, limit: number | null): boolean =>
  seq != null && limit != null && seq > limit;
check("seq 301 over Starter's 300 → locked", lockedBySeq(301, PLAN_LIMITS.STARTER.responsesPerMonth));
check("seq 300 at the cap → NOT locked", !lockedBySeq(300, PLAN_LIMITS.STARTER.responsesPerMonth));
check("null seq (pre-gate/in-progress) → never locked", !lockedBySeq(null, 25));
check("unlimited scope (null limit) → never locked", !lockedBySeq(999_999, null));
check("upgrade unlocks: seq 301 within Growth's 2000", !lockedBySeq(301, PLAN_LIMITS.GROWTH.responsesPerMonth));

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
