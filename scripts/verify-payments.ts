/**
 * verify:payments - PRE-FLIGHT for the subscription checkout.
 *
 * Why this script exists: the Razorpay subscription flow is complete in code
 * (`startSubscriptionCheckout` → Checkout → `verifySubscriptionPayment` → the webhook at
 * /api/billing/razorpay) and has never carried a real transaction. Nobody has ever
 * subscribed, so "it looks right" is the strongest claim the code can make on its own.
 *
 * What it CAN prove, and does: that the configuration the first real checkout will use
 * is the configuration you think it is. Specifically the one way a customer could be
 * charged the WRONG AMOUNT -
 *
 *   `getOrCreatePlan` self-heals: it caches a Razorpay Plan id with the cents it was
 *   created at, and a price change invalidates the cache, so a new Plan is created at the
 *   new price. The one thing that could defeat that was an env override
 *   (RAZORPAY_PLAN_ID_*), returned unverified ahead of the price - 🟢 removed from the
 *   code on 2026-10-13, having never been set in any environment. What remains to check
 *   is the CACHE: a cached Plan whose amount still matches is reused, so this fetches it
 *   from Razorpay and compares it with the catalog.
 *
 * So this resolves the plan id the code would ACTUALLY use for each paid tier, fetches
 * that Plan from Razorpay, and asserts the amount, currency and period match the
 * catalog. Read-only: it creates nothing, charges nothing, and changes nothing.
 *
 * What it CANNOT prove, and does not pretend to: that a payment succeeds. Checkout, the
 * signature verification and the webhook round-trip need a real card. Put ONE live
 * subscription through before pointing ads at a signup page.
 *
 *   railway run --environment orbitq-assess npm run verify:payments      (staging)
 *   railway run --environment production    npm run verify:payments      (prod)
 *
 * Runs with `--conditions=react-server`, like db:seed. The Razorpay client and the
 * settings resolver both import `server-only`, which throws under plain `tsx` - that
 * flag resolves it to its no-op server build. Without it the script dies on import,
 * which is the same wall that made `plan-resolve.ts` a separate module from
 * `entitlements.ts` so the Railway cron could use it.
 */
import "./public-db-url";
import { prisma } from "../src/lib/db/prisma";
import { resolveRazorpayConfig } from "../src/lib/settings/config";
import { isRazorpayConfigured, razorpayRequest } from "../src/lib/payments/razorpay";
import { PLAN_LABEL, PLAN_PRICE_USD, PLAN_IDS, type PlanId } from "../src/lib/billing/plans";
import { env } from "../src/lib/env";

let failures = 0;
let warnings = 0;
const pass = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d = "") => {
  failures += 1;
  console.log(`  FAIL  ${n}${d ? `\n        ${d}` : ""}`);
};
const warn = (n: string, d = "") => {
  warnings += 1;
  console.log(`  WARN  ${n}${d ? `\n        ${d}` : ""}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? pass(n) : fail(n, d));

/** The paid tiers that have a published price and a Razorpay Plan. */
const PAID: PlanId[] = PLAN_IDS.filter((p) => p !== "ENTERPRISE");

interface FetchedPlan {
  id: string;
  period?: string;
  interval?: number;
  item?: { amount?: number; currency?: string; name?: string };
}

async function main(): Promise<void> {
  console.log("Razorpay subscription pre-flight\n");

  // (a) Platform keys. Settings row first, env as the platform-only fallback - the same
  //     resolution the checkout uses, so a key configured in the wrong place shows up
  //     here rather than as a failed checkout.
  const cfg = await resolveRazorpayConfig(null);
  const keys = { keyId: cfg.keyId, keySecret: cfg.keySecret };
  expect("platform Razorpay API keys resolve", isRazorpayConfigured(keys), "Set them in Settings (platform scope) or RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.");
  if (!isRazorpayConfigured(keys)) {
    console.log("\nNo keys - stopping. Nothing below can be checked without them.");
    process.exit(1);
  }
  // Live vs test is not a failure (staging SHOULD be on test keys) but it is the single
  // most expensive thing to be wrong about, so it is always printed.
  const live = keys.keyId!.startsWith("rzp_live_");
  console.log(`        key mode: ${live ? "LIVE - real money" : "test"} (${keys.keyId!.slice(0, 12)}…)`);

  // (b) Webhook secret. Without it `verifyWebhookSignature` rejects every delivery, so
  //     subscriptions would activate on the client round-trip and then never renew,
  //     never go past-due, and never park - silently.
  expect("webhook signing secret is set", !!cfg.webhookSecret, "Razorpay Dashboard → Webhooks → the secret you set there, into Settings or RAZORPAY_WEBHOOK_SECRET.");

  // (c) Per tier: the plan id the code would really use, verified against the catalog.
  console.log("\nPlan objects (amount the first subscriber would actually be charged):");
  for (const plan of PAID) {
    const label = `${PLAN_LABEL[plan]} ($${PLAN_PRICE_USD[plan]}/mo)`;
    const expectedCents = PLAN_PRICE_USD[plan] * 100;

    const cached = await prisma.razorpayPlan.findUnique({ where: { planKey: plan } });
    if (!cached) {
      // Not an error: no cache means the FIRST checkout creates the Plan from the
      // catalog, which is correct by construction - that is the path that cannot be
      // wrong, and since the env overrides were removed it is also the only one.
      pass(`${label} - no cached Plan: created from the catalog on first checkout`);
      continue;
    }
    const planId = cached.razorpayPlanId;
    const source = "cached RazorpayPlan row";
    if (cached.amountCents !== expectedCents || cached.currency !== "USD") {
      // Self-healing, but worth naming: the cache is stale and will be replaced. This is
      // what a price change looks like here the day after it ships.
      warn(
        `${label} - cached row is stale (${cached.amountCents} ${cached.currency})`,
        "Expected after a price change; getOrCreatePlan ignores a stale cache and creates a fresh Plan at the current price.",
      );
      continue;
    }

    let fetched: FetchedPlan;
    try {
      fetched = await razorpayRequest<FetchedPlan>("GET", `/plans/${planId}`, keys);
    } catch (e) {
      fail(`${label} - Plan ${planId} (${source}) could not be fetched`, e instanceof Error ? e.message : String(e));
      continue;
    }

    const cents = fetched.item?.amount ?? -1;
    const currency = fetched.item?.currency ?? "?";
    const monthly = fetched.period === "monthly" && (fetched.interval ?? 1) === 1;
    const amountOk = cents === expectedCents;
    const currencyOk = currency === "USD";

    if (amountOk && currencyOk && monthly) {
      pass(`${label} - Plan ${planId} charges ${cents} ${currency} monthly (${source})`);
    } else {
      fail(
        `${label} - Plan ${planId} does NOT match the catalog (${source})`,
        `Razorpay says ${cents} ${currency} every ${fetched.interval ?? 1} ${fetched.period ?? "?"}; the catalog says ${expectedCents} USD monthly. The cached row claims it matches, so the Plan was edited inside Razorpay - delete the razorpay_plan row for this tier and let the next checkout create a correct one.`,
      );
    }
  }

  // (d) Where Razorpay must deliver. Not checkable from here (Razorpay does not expose
  //     the configured endpoint on the API), so it is printed for a dashboard compare -
  //     a webhook pointed at the wrong host is indistinguishable from one that works
  //     until a renewal silently fails.
  console.log("\nWebhook endpoint to register in the Razorpay Dashboard:");
  console.log(`        ${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/billing/razorpay`);
  console.log("        events: subscription.activated, .charged, .pending, .halted, .cancelled, .completed");

  // (e) 🟢 The six RAZORPAY_PLAN_ID_* variables are gone from the code (2026-10-13), so
  //     there is no longer a way to pin a tier to a Plan the catalog did not create.
  //     Anything still set with that name in an environment is inert - the app no longer
  //     reads it - and should be deleted so it cannot be mistaken for live config.

  console.log(
    `\n${failures === 0 ? "🟢 Config pre-flight clean" : `🔴 ${failures} failure(s)`}${warnings ? ` · ${warnings} warning(s)` : ""}.`,
  );
  console.log("🟡 Still unproven by any script: Checkout, signature verification and the webhook round-trip.");
  console.log("   Put ONE real subscription through before pointing ad spend at a signup page.");
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  const msg = e instanceof Error ? e.message : String(e);
  // The expected first failure: run from a laptop with no local Postgres. Say what to do
  // instead of printing a Prisma stack that buries the one useful line.
  if (/Can't reach database server|P1001/.test(msg)) {
    console.error("\n🔴 No database. This script reads the platform's Razorpay settings row, so it needs one.");
    // Railway's staging environment is named orbitq-assess, NOT "staging" - naming it
    // wrong here sent the first real run of this script down a dead end.
    console.error("   Staging:    railway run --environment orbitq-assess npm run verify:payments");
    console.error("   Production: railway run --environment production npm run verify:payments");
    console.error("   (The public Postgres proxy is occasionally unreachable for a moment - retry once before digging.)");
  } else {
    console.error(e);
  }
  await prisma.$disconnect();
  process.exit(1);
});
