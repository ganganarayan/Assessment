/**
 * Annual-billing verification (no DB, no network).
 *
 * Annual is the one price on the site that was published for months while checkout could
 * not sell it: getOrCreatePlan only ever built `period: "monthly"` Razorpay plans, so the
 * toggle on /pricing changed a number and nothing else. This is the gate that stops that
 * happening again, and it checks the three things that are wrong by a factor of twelve if
 * nobody is watching.
 *
 * What it proves:
 *   1. THE PAGE AND THE CHARGE AGREE. Every annual figure printed in marketing/content.ts
 *      (the tier cards and the comparison matrix) equals PLAN_PRICE_USD_ANNUAL, which is
 *      what checkout multiplies by twelve and charges. A page figure the catalog does not
 *      share is a price the card will not be charged.
 *   2. THE ARITHMETIC. chargeUsd(plan, "YEARLY") is the per-month figure times twelve, and
 *      is strictly cheaper than paying monthly for a year - otherwise "save up to 18%" is
 *      a lie printed next to a button.
 *   3. THE USAGE WINDOW ROLLS OVER MONTHLY ON A YEARLY TERM. This is the one that would
 *      have hurt a real customer: responses are metered against the Razorpay period
 *      start, which moves once a year on a yearly subscription, so keying usage off it
 *      directly caps an annual customer at one month's allowance for twelve months.
 *   4. The renewal date is twelve months out, with the same month-end clamp as monthly.
 *   5. The monthly Razorpay plan cache key is still the bare tier name, so the plan rows
 *      cached before annual existed are reused rather than orphaned and duplicated.
 *   6. The term column and its enum exist in the schema AND in a migration.
 *
 *   npx tsx scripts/verify-billing-term.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BILLING_TERMS,
  chargeUsd,
  MONTHS_PER_YEAR,
  PLAN_IDS,
  PLAN_LABEL,
  PLAN_PRICE_USD,
  PLAN_PRICE_USD_ANNUAL,
  annualSavingUsd,
  isBillingTerm,
  usagePeriodKey,
  type PlanId,
} from "../src/lib/billing/plans";
import { monthlyWindowStart, nextRenewal } from "../src/lib/billing/renewal";
import { TIERS, PLAN_MATRIX } from "../src/lib/marketing/content";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

/** The tiers that can actually be charged. Enterprise is quoted and has no annual price. */
const CHARGEABLE: PlanId[] = PLAN_IDS.filter((p) => p !== "ENTERPRISE");

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

console.log("Annual billing verification\n");

// --- 1. The page and the charge agree ---------------------------------------
for (const plan of PLAN_IDS) {
  const tier = TIERS.find((t) => t.name === PLAN_LABEL[plan]);
  if (!tier) {
    fail(`${plan} has a marketing tier`, `no TIERS entry named "${PLAN_LABEL[plan]}"`);
    continue;
  }
  const catalog = PLAN_PRICE_USD_ANNUAL[plan];
  if (catalog === null) {
    expect(
      `${plan} publishes no annual price`,
      tier.annual === null,
      `the catalog has no annual price for ${plan} but the page prints ${tier.annual}, which checkout cannot charge`,
    );
    continue;
  }
  expect(
    `${plan} page annual price matches the catalog`,
    tier.annual === `$${catalog}`,
    `page says ${tier.annual}, catalog says $${catalog}. The catalog is what the card is charged against.`,
  );
}

const annualRow = PLAN_MATRIX.find((r) => r.label === "Annual, per month");
if (!annualRow) {
  fail("the comparison matrix has an annual row", 'no PLAN_MATRIX row labelled "Annual, per month"');
} else {
  PLAN_IDS.forEach((plan, i) => {
    const catalog = PLAN_PRICE_USD_ANNUAL[plan];
    const cell = annualRow.cells[i];
    const want = catalog === null ? "quoted" : `$${catalog}`;
    expect(
      `matrix annual cell for ${plan} matches the catalog`,
      cell === want,
      `matrix says ${cell}, expected ${want}`,
    );
  });
}

// --- 2. The arithmetic ------------------------------------------------------
expect("both terms exist and are recognised", BILLING_TERMS.every(isBillingTerm) && BILLING_TERMS.length === 2);
expect("an unknown term is refused", !isBillingTerm("WEEKLY") && !isBillingTerm(12) && !isBillingTerm(null));

for (const plan of CHARGEABLE) {
  const perMonth = PLAN_PRICE_USD_ANNUAL[plan];
  expect(`${plan} has an annual price`, perMonth !== null, "a chargeable tier with no annual price cannot be sold yearly");
  if (perMonth === null) continue;

  expect(
    `${plan} yearly charge is the per-month figure times ${MONTHS_PER_YEAR}`,
    chargeUsd(plan, "YEARLY") === perMonth * MONTHS_PER_YEAR,
    `chargeUsd returned ${chargeUsd(plan, "YEARLY")}, expected ${perMonth * MONTHS_PER_YEAR}`,
  );
  expect(
    `${plan} monthly charge is the monthly price`,
    chargeUsd(plan, "MONTHLY") === PLAN_PRICE_USD[plan],
  );
  const saving = annualSavingUsd(plan);
  expect(
    `${plan} is actually cheaper on the year`,
    saving !== null && saving > 0,
    `paying yearly saves ${saving}, so the discount badge beside the toggle is false`,
  );
}

expect(
  "Enterprise has no yearly charge",
  chargeUsd("ENTERPRISE", "YEARLY") === null,
  "Enterprise is quoted, never charged through this flow - a number here would be a published price nobody agreed",
);

// --- 3. The usage window ----------------------------------------------------
// The whole point: one month's allowance must not stretch across a paid year.
const anchor = utc(2026, 1, 15);
const yearKeys = new Set(
  // The twentieth of each month of the paid year, against a 15 January anchor.
  Array.from({ length: MONTHS_PER_YEAR }, (_, i) =>
    usagePeriodKey(anchor, utc(2026, i + 1, 20), "YEARLY"),
  ),
);
expect(
  "a yearly subscription gets 12 distinct usage windows in its year",
  yearKeys.size === 12,
  `got ${yearKeys.size} distinct keys across twelve months, so an annual customer shares one allowance between ${12 / Math.max(1, yearKeys.size)} months`,
);

expect(
  "a yearly window is keyed to the anchor day",
  usagePeriodKey(anchor, utc(2026, 3, 20), "YEARLY") === "2026-03-15",
  `got ${usagePeriodKey(anchor, utc(2026, 3, 20), "YEARLY")}, expected 2026-03-15`,
);
expect(
  "a yearly window does not move before its month is reached",
  usagePeriodKey(anchor, utc(2026, 3, 14), "YEARLY") === "2026-02-15",
  `got ${usagePeriodKey(anchor, utc(2026, 3, 14), "YEARLY")}, expected 2026-02-15`,
);
expect(
  "MONTHLY still keys straight off the provider's period start",
  usagePeriodKey(anchor, utc(2026, 1, 20), "MONTHLY") === "2026-01-15" &&
    usagePeriodKey(anchor, utc(2026, 9, 20), "MONTHLY") === "2026-01-15",
  "monthly period starts already move every cycle; deriving windows for them would replace a provider fact with our arithmetic",
);
expect(
  "the term defaults to MONTHLY",
  usagePeriodKey(anchor, utc(2026, 9, 20)) === usagePeriodKey(anchor, utc(2026, 9, 20), "MONTHLY"),
);
expect(
  "no period start still means the calendar month",
  usagePeriodKey(null, utc(2026, 9, 20), "YEARLY") === "2026-09",
);

// --- 4. Renewal dates ------------------------------------------------------
expect(
  "a yearly subscription renews twelve months on",
  nextRenewal(utc(2026, 1, 15), MONTHS_PER_YEAR).toISOString().startsWith("2027-01-15"),
  `got ${nextRenewal(utc(2026, 1, 15), MONTHS_PER_YEAR).toISOString()}`,
);
expect(
  "a short month clamps rather than rolling forward",
  monthlyWindowStart(utc(2026, 1, 31), utc(2026, 3, 1)).toISOString().startsWith("2026-02-28"),
  `got ${monthlyWindowStart(utc(2026, 1, 31), utc(2026, 3, 1)).toISOString()}, expected 2026-02-28 - rolling to 3 March would bill before the date the customer was shown`,
);
expect(
  "the window is the anchor itself before the first step",
  monthlyWindowStart(anchor, utc(2026, 1, 16)).getTime() === anchor.getTime(),
);

// --- 5. The plan cache key -------------------------------------------------
const subsSrc = readFileSync(join(process.cwd(), "src/lib/billing/razorpay-subscriptions.ts"), "utf8");
expect(
  "the monthly plan cache key is still the bare tier name",
  subsSrc.includes('term === "YEARLY" ? `${plan}_YEARLY` : plan'),
  "suffixing BOTH terms orphans the RazorpayPlan rows cached before annual existed, and the next checkout creates a second monthly plan at the same price",
);
expect(
  "the yearly Razorpay plan is created with a yearly period",
  subsSrc.includes('{ period: "yearly", totalCount: 10 }'),
  "a yearly price on a monthly period charges the year's money every month",
);
expect(
  "every amount sent to Razorpay goes through the term-aware helper",
  !/amountCents\s*=\s*PLAN_PRICE_USD\[/.test(subsSrc),
  "PLAN_PRICE_USD is the MONTHLY price; using it for a yearly plan undercharges by twelve",
);

// --- 5b. Every usage-period call site passes the term ----------------------
// The counter is WRITTEN by gate.ts and READ by entitlements.ts. If one of them derives
// the window and the other does not, a yearly subscriber is counted under one key and
// read under another: the meter shows nothing while the cap still locks their leads.
// Nothing in the type system catches it, because the parameter has a default.
for (const file of ["src/lib/billing/entitlements.ts", "src/lib/billing/gate.ts"]) {
  const src = readFileSync(join(process.cwd(), file), "utf8");
  const calls = src.match(/usagePeriodKey\([^)]*\)/g) ?? [];
  expect(
    `${file} calls usagePeriodKey at all`,
    calls.length > 0,
    "the file imported it and then stopped using it, which means some other period key is in play",
  );
  for (const call of calls) {
    expect(
      `${file}: ${call.slice(0, 48)} passes a term`,
      call.split(",").length >= 3,
      "a two-argument call takes the MONTHLY default, so a yearly subscription holds one usage window for twelve months",
    );
  }
  expect(
    `${file} selects the term it passes`,
    src.includes("term: true"),
    "the term has to be read from the row before it can be passed",
  );
}

// --- 6. Schema and migration ----------------------------------------------
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
expect("the schema declares BillingTerm", /enum BillingTerm\s*\{[^}]*MONTHLY[^}]*YEARLY/m.test(schema));
expect(
  "Subscription carries the term",
  /term\s+BillingTerm\s+@default\(MONTHLY\)/.test(schema),
  "without the column the renewal date and the usage window have nothing to read",
);

const migrations = readdirSync(join(process.cwd(), "prisma/migrations")).filter((d) => !d.endsWith(".toml"));
const hasTermMigration = migrations.some((d) => {
  let sql = "";
  try {
    sql = readFileSync(join(process.cwd(), "prisma/migrations", d, "migration.sql"), "utf8");
  } catch {
    return false;
  }
  return sql.includes('CREATE TYPE "BillingTerm"') && sql.includes('ADD COLUMN "term"');
});
expect(
  "a migration creates the enum and the column",
  hasTermMigration,
  "the schema and the database disagree, so the first read of subscription.term fails in production",
);

// --- 7. Switching term must not take away the plan already paid for --------
/**
 * 🔴 TWO BUGS THAT LEFT NO TRACE, both reachable the moment annual became buyable.
 *
 * Checkout writes the Subscription row before the customer pays. It used to write the
 * whole entitlement there - plan, term, status, limits - which did two things to someone
 * who was already paying:
 *
 *   (a) status PENDING, and entitledPlan maps PENDING to null, so an active customer was
 *       parked on the plan they had already paid for the instant the modal opened. Close
 *       the modal and they stayed parked.
 *   (b) the TARGET plan and its limits were stamped on them, so abandoning the modal left
 *       them entitled to a tier they never bought.
 *
 * And because the same write overwrote razorpaySubscriptionId with the new id, the
 * cancellation in activateSubscription - which compared that column against the id being
 * activated - was comparing the new id with itself. It never fired. The replaced
 * subscription stayed live and charged alongside the new one, to a customer that
 * `customer_notify: 0` guaranteed heard nothing about.
 *
 * Nothing threw and nothing logged in any of the three. The symptoms were a support
 * message about a plan that vanished, and a second charge nobody expected. So they are
 * asserted at the source.
 */
const subscribeSrc = readFileSync(join(process.cwd(), "src/features/billing/actions/subscribe.ts"), "utf8");

expect(
  "checkout reads what the tenant already holds",
  /entitledPlan\(existing\.plan, existing\.status\)/.test(subsSrc),
  "without this read, checkout cannot tell a new subscriber from a paying customer",
);
expect(
  "checkout decides by the resolver's own rule, not its own copy of it",
  /import \{ entitledPlan \} from "@\/lib\/billing\/plan-grant"/.test(subsSrc),
  "a second definition of what a status entitles will drift from the one the gates use",
);
expect(
  "an entitled row keeps plan, term, status and limits at checkout start",
  /update: holdsAPlan\s*\n?\s*\? \{ \.\.\.ids, \.\.\.intent \}/.test(subsSrc),
  "writing the entitlement before the payment parks a paying customer and gives away the target tier",
);
expect(
  "the open checkout's plan and term are recorded as intent",
  /pendingPlan: plan, pendingTerm: term/.test(subsSrc),
  "/verify has to read the term from our own row; with nowhere to put it, it would trust the browser",
);
expect(
  "the replaced subscription id is captured at checkout start",
  /priorRazorpaySubscriptionId: prior/.test(subsSrc),
  "the old id is overwritten by the new one, so unless it is kept here it is gone",
);
expect(
  "activation cancels the id from its own column",
  /select: \{ priorRazorpaySubscriptionId: true \}[\s\S]{0,200}?existing\?\.priorRazorpaySubscriptionId/.test(subsSrc),
  "reading razorpaySubscriptionId instead compares the new id against itself and never cancels",
);
/**
 * The id must be cleared in exactly ONE place, and that place must come after the cancel
 * succeeded. Asserted by position rather than by a window around the text: the first
 * version of this check looked for the clear within 400 characters of the transaction and
 * quietly passed when the entitlement object was long enough to push it out of range, so
 * the check that was meant to catch the regression could not see it.
 */
const clears = (subsSrc.match(/priorRazorpaySubscriptionId: null/g) ?? []).length;
const cancelAt = subsSrc.indexOf("await cancelRazorpaySubscription(prior);");
const clearAt = subsSrc.indexOf("priorRazorpaySubscriptionId: null");
expect(
  "a failed cancel keeps the id instead of forgetting it",
  clears === 1 && cancelAt !== -1 && clearAt > cancelAt,
  "cleared alongside the entitlement, a refused cancel leaves a subscription charging that nothing points at",
);
expect(
  "a failed cancel is logged rather than swallowed",
  /cancelRazorpaySubscription\(prior\)[\s\S]{0,400}?console\.error/.test(subsSrc),
  "a silent catch here is the original bug in a new place: money moves and nothing records it",
);
expect(
  "the intent is cleared when it is granted",
  /pendingPlan: null,\s*\n\s*pendingTerm: null,/.test(subsSrc),
  "a row still claiming a pending upgrade makes /verify read a stale term on the next charge",
);
expect(
  "/verify takes the term from the intent, not the browser",
  /toTerm\(sub\.pendingTerm \?\? sub\.term\)/.test(subscribeSrc),
  "the term decides the renewal date and the amount; from the browser it is a claim, not a fact",
);
expect(
  "/verify takes the PLAN from the intent too",
  /sub\.pendingPlan \? toPlanId\(sub\.pendingPlan\) : null/.test(subscribeSrc) &&
    /plan: charged,/.test(subscribeSrc),
  "a signature proves a payment happened, not what tier it bought, so a request could claim a higher one",
);
expect(
  "the schema carries the intent and the replaced id",
  /priorRazorpaySubscriptionId String\?/.test(schema) &&
    /pendingPlan Plan\?/.test(schema) &&
    /pendingTerm BillingTerm\?/.test(schema),
);
expect(
  "a migration adds all three columns",
  migrations.some((d) => {
    let sql = "";
    try {
      sql = readFileSync(join(process.cwd(), "prisma/migrations", d, "migration.sql"), "utf8");
    } catch {
      return false;
    }
    return (
      sql.includes('ADD COLUMN "priorRazorpaySubscriptionId"') &&
      sql.includes('ADD COLUMN "pendingPlan"') &&
      sql.includes('ADD COLUMN "pendingTerm"')
    );
  }),
  "the schema and the database disagree, and the first checkout after deploy fails on a missing column",
);

console.log(failures === 0 ? "\nAll annual-billing checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
