"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PLAN_IDS, PLAN_LABEL, type PlanId } from "@/lib/billing/plans";
import {
  activateSubscription,
  cancelRazorpaySubscription,
  createTestSubscription,
  endSubscription,
  platformKeyId,
  switchTestSubscriptionPlan,
  testPriceText,
  TEST_PRICE_BOUNDS,
  type TestPrice,
} from "@/lib/billing/razorpay-subscriptions";
import { sendBillingEmail } from "@/lib/billing/billing-email";
import { forgetTenantActive } from "@/lib/tenant/active";
import { PAYMENT_TEST_TENANT_ID } from "@/lib/tenant/platform-tenant";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The super-admin Test payments screen (owner, 14-11-2026): platform payments tested end
 * to end with real money, at an amount and currency the owner types, with NO workspace to
 * pick. Every action bills the one hidden test workspace (PAYMENT_TEST_TENANT_ID), which
 * is created on the first checkout.
 *
 * Subscribe and upgrade open a REAL Razorpay checkout on the platform GST account and go
 * through the same activation a customer's payment does. Downgrade switches the live
 * subscription to the cheaper tier with no charge today. Cancel ends it NOW (a customer's
 * cancel waits for the period end) so the owner can watch the plan switch off.
 */

const TEST_TENANT = PAYMENT_TEST_TENANT_ID;
const RANK: Record<PlanId, number> = { GATE: 1, SIGNAL: 2, AGENCY: 3, ENTERPRISE: 4 };

function toPlanId(v: unknown): PlanId | null {
  return typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v) ? (v as PlanId) : null;
}

/** The typed amount, checked: a currency, a number with at most 2 decimals, within bounds. */
function toPrice(currencyInput: unknown, amountInput: unknown): TestPrice | { error: string } {
  const currency = currencyInput === "USD" ? "USD" : currencyInput === "INR" ? "INR" : null;
  if (!currency) return { error: "Pick INR or USD." };
  const text = String(amountInput ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: "Type the amount as a number, like 1 or 1.10." };
  const minor = Math.round(Number(text) * 100);
  const { min, max } = TEST_PRICE_BOUNDS[currency];
  if (minor < min || minor > max) {
    return { error: `${currency} amount must be between ${(min / 100).toFixed(2)} and ${(max / 100).toFixed(2)}.` };
  }
  return { currency, minor };
}

/** The hidden test workspace, made on first use. Never parked by a trial: it has none. */
async function ensureTestTenant() {
  return prisma.tenant.upsert({
    where: { id: TEST_TENANT },
    create: { id: TEST_TENANT, slug: "platform-payment-test", name: "Platform test (payments)" },
    update: {},
    select: { id: true, name: true, razorpayCustomerId: true },
  });
}

async function heldPlan(): Promise<PlanId | null> {
  const current = await resolvePlan(TEST_TENANT);
  return current.status === "ACTIVE" || current.status === "PAST_DUE" ? current.plan : null;
}

export interface TestCheckoutStart {
  subscriptionId: string;
  keyId: string;
  shortUrl: string;
  amountText: string;
  prefill: { name: string; email: string };
}

/** Subscribe or upgrade: open a real checkout at the typed amount and currency. */
export async function startTestCheckout(
  planInput: string,
  currencyInput: string,
  amountInput: string,
): Promise<ActionResult<TestCheckoutStart>> {
  const user = await requireSuperAdmin();
  const plan = toPlanId(planInput);
  if (!plan) return { ok: false, error: "Unknown plan." };
  const price = toPrice(currencyInput, amountInput);
  if ("error" in price) return { ok: false, error: price.error };

  const keyId = await platformKeyId();
  if (!keyId) return { ok: false, error: "Platform Razorpay keys are not set (Settings, Payments)." };

  const tenant = await ensureTestTenant();
  const held = await heldPlan();
  if (held && RANK[plan] <= RANK[held]) {
    return { ok: false, error: `${PLAN_LABEL[held]} is held already. Use Downgrade for a lower plan, or Cancel first.` };
  }

  try {
    const { subscriptionId, shortUrl } = await createTestSubscription(
      { id: tenant.id, name: tenant.name, razorpayCustomerId: tenant.razorpayCustomerId, ownerEmail: user.email ?? null },
      plan,
      price,
    );
    return {
      ok: true,
      data: {
        subscriptionId,
        keyId,
        shortUrl,
        amountText: testPriceText(price),
        prefill: { name: user.name ?? "", email: user.email ?? "" },
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Razorpay would not open the checkout.";
    return {
      ok: false,
      error:
        price.currency === "USD"
          ? `${msg} (A USD subscription needs international payments switched on for the GST Razorpay account.)`
          : msg,
    };
  }
}

export interface TestVerifyInput {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

/**
 * Verify the test payment and activate at once, the same way /verify does for a
 * customer. The tier comes off the row's pending intent, never from the browser.
 * No Meta Purchase: a test charge must never teach the ad account anything.
 */
export async function verifyTestPayment(input: TestVerifyInput): Promise<ActionResult<{ plan: string }>> {
  await requireSuperAdmin();
  const { keySecret } = await resolveRazorpayConfig(null);
  if (!keySecret) return { ok: false, error: "Payment service not configured." };
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.razorpay_payment_id}|${input.razorpay_subscription_id}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(input.razorpay_signature ?? ""));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "Payment verification failed." };
  }

  const sub = await prisma.subscription.findUnique({
    where: { tenantId: TEST_TENANT },
    select: { razorpaySubscriptionId: true, razorpayPlanId: true, pendingPlan: true },
  });
  if (sub?.razorpaySubscriptionId !== input.razorpay_subscription_id) {
    return { ok: false, error: "That subscription is not the one this screen opened." };
  }
  const plan = toPlanId(sub.pendingPlan);
  if (!plan) return { ok: false, error: "Paid, but the plan it was for is not recorded. The webhook will settle it." };

  await activateSubscription({
    tenantId: TEST_TENANT,
    plan,
    term: "MONTHLY",
    razorpaySubscriptionId: input.razorpay_subscription_id,
    razorpayPlanId: sub.razorpayPlanId ?? null,
    paymentId: input.razorpay_payment_id,
    test: true,
  });
  revalidatePath("/admin/test-payments");
  return { ok: true, data: { plan: PLAN_LABEL[plan] } };
}

/** Downgrade: switch the live test subscription to a lower tier at the typed price, nothing charged today. */
export async function downgradeTestSubscription(
  planInput: string,
  currencyInput: string,
  amountInput: string,
): Promise<ActionResult<{ summary: string }>> {
  await requireSuperAdmin();
  const plan = toPlanId(planInput);
  if (!plan) return { ok: false, error: "Unknown plan." };
  const price = toPrice(currencyInput, amountInput);
  if ("error" in price) return { ok: false, error: price.error };

  const held = await heldPlan();
  if (!held || RANK[plan] >= RANK[held]) {
    return { ok: false, error: "Downgrade needs a paid plan above this one. Subscribe first." };
  }

  try {
    await switchTestSubscriptionPlan(TEST_TENANT, plan, price);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Razorpay refused the plan change: ${msg}. Razorpay only allows a plan change on a subscription paid by card, and in the same currency, so subscribe again with a card if this one was UPI.`,
    };
  }

  const row = await prisma.subscription.findUnique({ where: { tenantId: TEST_TENANT }, select: { renewsAt: true } });
  await sendBillingEmail({
    tenantId: TEST_TENANT,
    kind: "downgraded",
    plan,
    previousPlan: held,
    term: "MONTHLY",
    recurringAmountText: testPriceText(price),
    noChargeToday: true,
    renewsAt: row?.renewsAt ?? null,
  });
  revalidatePath("/admin/test-payments");
  return {
    ok: true,
    data: { summary: `Now on ${PLAN_LABEL[plan]}. Nothing charged today; ${testPriceText(price)} from the next renewal.` },
  };
}

/**
 * Cancel NOW: Razorpay stops charging and the plan ends. Both the current id and any
 * replaced-but-not-yet-cancelled one are cancelled, because an abandoned checkout leaves
 * the row pointing at an unpaid subscription while the paid one is the one still charging.
 */
export async function cancelTestSubscription(): Promise<ActionResult<{ summary: string }>> {
  await requireSuperAdmin();

  const sub = await prisma.subscription.findUnique({
    where: { tenantId: TEST_TENANT },
    select: { plan: true, status: true, razorpaySubscriptionId: true, priorRazorpaySubscriptionId: true },
  });
  if (!sub?.razorpaySubscriptionId) return { ok: false, error: "There is no test subscription to cancel." };
  if (sub.status === "CANCELED" || sub.status === "HALTED") return { ok: false, error: "This subscription has already ended." };

  const ids = [sub.razorpaySubscriptionId, sub.priorRazorpaySubscriptionId].filter((x): x is string => !!x);
  const failures: string[] = [];
  let cancelledOne = false;
  for (const id of ids) {
    try {
      await cancelRazorpaySubscription(id, false);
      cancelledOne = true;
    } catch (e) {
      failures.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!cancelledOne) {
    return { ok: false, error: `Razorpay would not cancel it. Nothing changed. ${failures.join("; ")}` };
  }

  await endSubscription(TEST_TENANT, "CANCELED");
  await prisma.subscription.update({
    where: { tenantId: TEST_TENANT },
    data: { cancelAtPeriodEnd: false, priorRazorpaySubscriptionId: null, pendingPlan: null, pendingTerm: null },
  });
  forgetTenantActive(TEST_TENANT);

  const plan = toPlanId(sub.plan) ?? "GATE";
  await sendBillingEmail({ tenantId: TEST_TENANT, kind: "cancelled", plan, endsAt: null });
  revalidatePath("/admin/test-payments");
  return { ok: true, data: { summary: `Cancelled. ${PLAN_LABEL[plan]} has ended and nothing more will be charged.` } };
}
