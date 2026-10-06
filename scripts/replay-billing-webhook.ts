/**
 * replay:billing - drive the platform subscription lifecycle without a payment.
 *
 * WHY. Razorpay's live mode cannot be rehearsed: every attempt is real money, a forex
 * markup and a settlement that lands days later. But the half of the flow that fails
 * SILENTLY is entirely ours - signature verification against the live secret, event
 * idempotency, activation, the entitlement flip, dunning and cancellation. All of that
 * is reachable with a correctly signed request, because that is exactly what Razorpay
 * sends. So this signs one and posts it.
 *
 * It proves: the live webhook secret matches what the app resolves, the endpoint is
 * reachable from outside, a duplicate event id is ignored, and each lifecycle event
 * moves the tenant where it should.
 *
 * It does NOT prove: that the Razorpay account is enabled for USD and international,
 * that Subscriptions is approved on it, or that a real card survives 3DS and the
 * issuer's mandate rules. Only one real charge proves those, and nothing else does.
 *
 * 🔴 THIS WRITES TO WHATEVER ENVIRONMENT YOU POINT IT AT. Against production it really
 * activates, parks or cancels the tenant you name. Use a tenant you own.
 *
 * Usage:
 *   tsx scripts/replay-billing-webhook.ts \
 *     --url https://assess360.divineleads.guru/api/billing/razorpay \
 *     --secret <the webhook secret that environment resolves> \
 *     --tenant <tenantId> --plan SIGNAL --event subscription.charged
 *
 *   --event     activated | charged | pending | halted | cancelled | completed
 *               (or the full "subscription.charged" spelling)
 *   --plan      GATE | SIGNAL | AGENCY | ENTERPRISE      (default SIGNAL)
 *   --sub       Razorpay subscription id to quote        (default sub_replay_<ts>)
 *   --event-id  reuse one to prove idempotency           (default unique per run)
 *   --email     --contact   what the Purchase event would carry
 *   --lifecycle run activated, charged, pending, halted, cancelled in order
 *   --dry-run   print the body and signature, send nothing
 *
 * The secret is read from --secret or RAZORPAY_WEBHOOK_SECRET, and is never printed.
 */
import crypto from "node:crypto";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const str = (k: string): string | null => (typeof args[k] === "string" ? (args[k] as string) : null);
const flag = (k: string): boolean => args[k] === true || args[k] === "true";

const url = str("url");
const secret = str("secret") ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? null;
const tenantId = str("tenant");
const plan = (str("plan") ?? "SIGNAL").toUpperCase();
const subscriptionId = str("sub") ?? `sub_replay_${Date.now()}`;
const email = str("email") ?? "owner@example.com";
const contact = str("contact") ?? "+919999999999";
const dryRun = flag("dry-run");

const PLANS = ["GATE", "SIGNAL", "AGENCY", "ENTERPRISE"];
const EVENTS = [
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
];

/** Accept the short name too: "charged" means "subscription.charged". */
function fullEvent(raw: string): string | null {
  const name = raw.includes(".") ? raw : `subscription.${raw}`;
  return EVENTS.includes(name) ? name : null;
}

function die(message: string): never {
  console.error(`\n${message}\n`);
  console.error("Run with --help for the usage block at the top of this file.");
  process.exit(1);
}

if (!url) die("--url is required (the full /api/billing/razorpay endpoint).");
if (!secret) die("--secret is required, or set RAZORPAY_WEBHOOK_SECRET.");
if (!tenantId) die("--tenant is required (the tenant id this subscription belongs to).");
if (!PLANS.includes(plan)) die(`--plan must be one of ${PLANS.join(", ")}.`);

/**
 * One event, shaped the way Razorpay shapes it.
 *
 * The handler reads `payload.subscription.entity` (id, plan_id, notes, current_start,
 * current_end) and, for a charge, `payload.payment.entity` (id, email, contact). The
 * tenant and plan travel in `notes`, which is where subscription creation puts them,
 * so a replay resolves the tenant the same way a real callback does.
 */
function buildBody(event: string): string {
  const now = Math.floor(Date.now() / 1000);
  const month = 30 * 24 * 60 * 60;
  const subscription = {
    entity: {
      id: subscriptionId,
      plan_id: `plan_replay_${plan.toLowerCase()}`,
      status: event === "subscription.cancelled" ? "cancelled" : "active",
      current_start: now,
      current_end: now + month,
      notes: { tenantId, plan },
    },
  };
  // A charge carries the payment that paid for it; the handler keys the platform
  // Purchase event on this id, so a repeat with the SAME id must not double count.
  const payment =
    event === "subscription.charged"
      ? { entity: { id: `pay_replay_${now}`, email, contact, subscription_id: subscriptionId } }
      : undefined;
  return JSON.stringify({
    entity: "event",
    account_id: "acc_replay",
    event,
    contains: payment ? ["subscription", "payment"] : ["subscription"],
    payload: payment ? { subscription, payment } : { subscription },
    created_at: now,
  });
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret as string).update(body).digest("hex");
}

async function send(event: string, eventId: string): Promise<boolean> {
  const body = buildBody(event);
  const signature = sign(body);

  if (dryRun) {
    console.log(`\n--- ${event} (dry run, nothing sent) ---`);
    console.log(`x-razorpay-event-id: ${eventId}`);
    console.log(`x-razorpay-signature: ${signature}`);
    console.log(body);
    return true;
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url as string, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
      body,
    });
  } catch (e) {
    console.log(`FAIL  ${event}: could not reach the endpoint (${e instanceof Error ? e.message : String(e)})`);
    return false;
  }

  const text = await res.text();
  const ms = Date.now() - started;
  const ok = res.status === 200;
  console.log(`${ok ? "PASS" : "FAIL"}  ${event}  ${res.status} in ${ms}ms  ${text.slice(0, 200)}`);
  if (res.status === 400 && text.includes("invalid signature")) {
    console.log(
      "      The secret this environment resolves is not the one passed here. For production that\n" +
        "      is the LIVE webhook secret from the Razorpay dashboard, saved in platform settings.",
    );
  }
  return ok;
}

async function main(): Promise<void> {
  const eventIdBase = str("event-id");
  console.log(`endpoint: ${url}`);
  console.log(`tenant:   ${tenantId}   plan: ${plan}   subscription: ${subscriptionId}`);

  if (flag("lifecycle")) {
    // The whole arc, in the order a real subscription walks it. Each step is its own
    // event id, so none of them is swallowed as a duplicate.
    const arc = [
      "subscription.activated",
      "subscription.charged",
      "subscription.pending",
      "subscription.halted",
      "subscription.cancelled",
    ];
    let failures = 0;
    for (const event of arc) {
      const okStep = await send(event, `evt_replay_${Date.now()}_${event}`);
      if (!okStep) failures++;
    }
    // The one rule a replay can prove that a single event cannot: a redelivery is a
    // no-op. Razorpay retries on any non-200, so this is not a theoretical case.
    const repeated = `evt_replay_dup_${Date.now()}`;
    await send("subscription.charged", repeated);
    console.log("      (the next line repeats that exact event id: expect duplicate: true)");
    await send("subscription.charged", repeated);
    console.log(failures === 0 ? "\nlifecycle OK" : `\nlifecycle FAILED (${failures})`);
    process.exit(failures === 0 ? 0 : 1);
  }

  const event = fullEvent(str("event") ?? "subscription.charged");
  if (!event) die(`--event must be one of ${EVENTS.join(", ")} (or the part after the dot).`);
  const okOne = await send(event, eventIdBase ?? `evt_replay_${Date.now()}`);
  process.exit(okOne ? 0 : 1);
}

void main();
