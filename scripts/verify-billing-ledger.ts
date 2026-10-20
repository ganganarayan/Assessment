/**
 * verify:billing-ledger - the money arithmetic, pinned.
 *
 * WHY THIS EXISTS. Three separate sums decide what a customer is told they owe and what
 * this business believes it earned, and all three are quiet when wrong:
 *
 *   the RENEWAL DATE, which the app computes itself because Razorpay's only ever
 *   arrives by webhook and the first real subscription here never got one,
 *
 *   the APPORTIONMENT, which splits a real AI invoice across tenants and rests on
 *   billed = attributed + unattributed holding exactly, every day,
 *
 *   the MODEL RATE, where a longest-prefix miss bills a cheap model at an expensive
 *   model's price and every figure downstream is wrong in the same direction.
 *
 * None of these throws when it breaks. A renewal date a day out still renders. A
 * rounding residue that silently vanishes still adds up on screen. A mini model priced
 * as a full one still produces a confident number. They are exactly the kind of thing a
 * check has to hold, because nothing else will notice.
 *
 * Pure: no database, no network, no clock. Runs anywhere, including in the build.
 *
 *   npm run verify:billing-ledger
 */
import { nextRenewal, renewalOverdue } from "../src/lib/billing/renewal";
import {
  apportion,
  ourMicroUsd,
  type BilledDay,
  type UsageRow,
} from "../src/lib/billing/ai-apportion";
import { costMicroUsd, rateFor, isPriced, hasCostReport } from "../src/lib/ai/pricing";

let failed = 0;
/** `why` prints only on failure: a check that fails without saying what it protected
 *  is a check the next person deletes. */
function check(name: string, cond: boolean, why?: string): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${why ? `\n       ${why}` : ""}`);
  }
}

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const day = (x: Date): string => x.toISOString().slice(0, 10);

// ───────────────────────────── renewal dates ─────────────────────────────
console.log("Renewal - the same day each month, clamped, anchor preserved");

check("15 Jan renews 15 Feb", day(nextRenewal(d("2026-01-15"))) === "2026-02-15");

check(
  "31 Jan renews 28 Feb, not 2 or 3 March",
  day(nextRenewal(d("2026-01-31"))) === "2026-02-28",
  "Letting the date roll forward walks a month-end customer later every year, and they are billed before the date we printed.",
);

check(
  "29 Feb exists in a leap year",
  day(nextRenewal(d("2028-01-31"))) === "2028-02-29",
  "2028 is a leap year; clamping to 28 would bill a day early for that whole cycle.",
);

check(
  "the clamp does NOT stick: 31 Jan anchor still gives 31 March",
  day(nextRenewal(d("2026-01-31"), 2)) === "2026-03-31",
  "If February's clamp became the new anchor, a 31st customer would be walked to the 28th permanently.",
);

check("December rolls the year", day(nextRenewal(d("2026-12-20"))) === "2027-01-20");

check(
  "31 March renews 30 April",
  day(nextRenewal(d("2026-03-31"))) === "2026-04-30",
  "30-day months clamp too, not only February.",
);

check(
  "the time of day survives",
  nextRenewal(new Date("2026-01-15T09:30:00.000Z")).toISOString() === "2026-02-15T09:30:00.000Z",
);

check("a future renewal is not overdue", renewalOverdue(d("2030-01-01"), d("2026-01-01")) === false);
check("a past renewal is overdue", renewalOverdue(d("2026-01-01"), d("2026-02-01")) === true);
check("no renewal date is never overdue", renewalOverdue(null, d("2026-02-01")) === false);

// ─────────────────────── our share of a shared invoice ───────────────────────
console.log("\nScope - this product's share of an organisation's bill");

check(
  "a dedicated account takes the whole bill",
  ourMicroUsd({ billedMicroUsd: 1_000_000, scopeTokens: 500, totalTokens: 500 }) === 1_000_000,
);

check(
  "a shared account splits by token share",
  ourMicroUsd({ billedMicroUsd: 1_000_000, scopeTokens: 250, totalTokens: 1_000 }) === 250_000,
  "Half the tokens must mean half the bill, or one product subsidises another.",
);

check(
  "no usage data means the whole bill is ours, not none of it",
  ourMicroUsd({ billedMicroUsd: 1_000_000, scopeTokens: 0, totalTokens: 0 }) === 1_000_000,
  "Understating here hides real money. If the split cannot be computed, assume it is all ours.",
);

// ───────────────────────────── apportionment ─────────────────────────────
console.log("\nApportionment - billed = attributed + unattributed, exactly");

{
  const billed: BilledDay[] = [{ provider: "claude", day: "2026-10-20", ourMicroUsd: 900_000 }];
  const usage: UsageRow[] = [
    { tenantId: "a", provider: "claude", day: "2026-10-20", tokens: 600 },
    { tenantId: "b", provider: "claude", day: "2026-10-20", tokens: 300 },
  ];
  const r = apportion(billed, usage);
  check("two tenants split 900000 as 600000 / 300000",
    r.byTenant.get("a") === 600_000 && r.byTenant.get("b") === 300_000);
  check("nothing is left unattributed when every token has a tenant",
    r.unattributedMicroUsd === 0);
  check("the invariant holds",
    r.billedMicroUsd === r.attributedMicroUsd + r.unattributedMicroUsd);
}

{
  // Thirds: 1,000,000 / 3 cannot divide evenly, so rounding must land somewhere visible.
  const billed: BilledDay[] = [{ provider: "claude", day: "2026-10-20", ourMicroUsd: 1_000_000 }];
  const usage: UsageRow[] = ["a", "b", "c"].map((t) => ({
    tenantId: t,
    provider: "claude",
    day: "2026-10-20",
    tokens: 100,
  }));
  const r = apportion(billed, usage);
  check(
    "a rounding residue does not disappear",
    r.billedMicroUsd === r.attributedMicroUsd + r.unattributedMicroUsd,
    "Shares are rounded, so they cannot sum to the bill. The remainder has to show as unattributed, not evaporate.",
  );
  check("and it is a residue, not a hole", Math.abs(r.unattributedMicroUsd) <= 2);
}

{
  // Platform generation: real spend, no tenant to bill it to.
  const billed: BilledDay[] = [{ provider: "claude", day: "2026-10-20", ourMicroUsd: 1_000_000 }];
  const usage: UsageRow[] = [
    { tenantId: "a", provider: "claude", day: "2026-10-20", tokens: 500 },
    { tenantId: null, provider: "claude", day: "2026-10-20", tokens: 500 },
  ];
  const r = apportion(billed, usage);
  check(
    "platform generation dilutes the divisor rather than being deleted from it",
    r.byTenant.get("a") === 500_000,
    "Dropping untenanted tokens from the divisor would charge tenant a the platform's half as well.",
  );
  check("and its half is reported as unattributed", r.unattributedMicroUsd === 500_000);
  check("the invariant still holds", r.billedMicroUsd === r.attributedMicroUsd + r.unattributedMicroUsd);
}

{
  // Each day divides by its OWN tokens. A cheap day and an expensive day must not be
  // averaged, or money moves between tenants while the total still looks right.
  const billed: BilledDay[] = [
    { provider: "claude", day: "2026-10-20", ourMicroUsd: 1_000_000 },
    { provider: "claude", day: "2026-10-21", ourMicroUsd: 10_000 },
  ];
  const usage: UsageRow[] = [
    { tenantId: "spender", provider: "claude", day: "2026-10-20", tokens: 100 },
    { tenantId: "thrifty", provider: "claude", day: "2026-10-21", tokens: 100 },
  ];
  const r = apportion(billed, usage);
  check(
    "the expensive day is charged to whoever used it",
    r.byTenant.get("spender") === 1_000_000 && r.byTenant.get("thrifty") === 10_000,
    "A range-wide average would split 1,010,000 evenly and still total correctly, which is how this goes unnoticed.",
  );
}

{
  // A provider is not another provider's bill.
  const billed: BilledDay[] = [{ provider: "claude", day: "2026-10-20", ourMicroUsd: 500_000 }];
  const usage: UsageRow[] = [{ tenantId: "a", provider: "openai", day: "2026-10-20", tokens: 100 }];
  const r = apportion(billed, usage);
  check("OpenAI usage does not claim an Anthropic invoice", (r.byTenant.get("a") ?? 0) === 0);
  check("that bill is unattributed", r.unattributedMicroUsd === 500_000);
  check("and the OpenAI day counts as unpriced", r.daysUnpriced === 1);
}

{
  const r = apportion([], [{ tenantId: "a", provider: "claude", day: "2026-10-20", tokens: 100 }]);
  check(
    "usage with no invoice costs nothing and is counted, not estimated",
    r.billedMicroUsd === 0 && r.attributedMicroUsd === 0 && r.daysUnpriced === 1,
    "Filling that gap with a price is exactly how the expense stops matching the bill.",
  );
}

check("no data at all is zero, not a crash", apportion([], []).billedMicroUsd === 0);

// ───────────────────────────── model rates ─────────────────────────────
console.log("\nRates - longest prefix wins, and an unknown model is admitted");

check(
  "gpt-4o-mini is NOT billed at gpt-4o rates",
  rateFor("gpt-4o-mini")?.inPerM === 0.15,
  "Shortest-prefix matching would bill the cheap model at 2.50, overstating cost roughly seventeen fold.",
);

check("gpt-4o still resolves", rateFor("gpt-4o")?.inPerM === 2.5);
check("a dated snapshot resolves to its family", rateFor("gpt-4o-2024-11-20")?.inPerM === 2.5);
check("case does not matter", rateFor("GPT-4O")?.inPerM === 2.5);

check(
  "an unknown model has no rate rather than a guessed one",
  rateFor("some-model-nobody-priced") === null && isPriced("some-model-nobody-priced") === false,
);

check(
  "and it costs zero rather than an invented amount",
  costMicroUsd("some-model-nobody-priced", 1_000_000, 1_000_000) === 0,
  "A guessed rate gets believed. A zero with a flag beside it does not.",
);

check(
  "a priced model computes from tokens",
  costMicroUsd("gpt-4o", 1_000_000, 0) === 2_500_000,
);

check(
  "Claude and OpenAI are not priced from the table at all",
  hasCostReport("claude") && hasCostReport("openai"),
  "They publish real invoices. Estimating them as well puts two numbers on one spend.",
);

check(
  "Gemini is, because it has no cost report",
  hasCostReport("gemini") === false,
);

console.log(failed === 0 ? "\n🟢 Ledger arithmetic holds." : `\n🔴 ${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
