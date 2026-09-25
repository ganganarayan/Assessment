"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PLAN_IDS, type PlanId } from "@/lib/billing/plans";
import {
  createSubscription,
  activateSubscription,
  isPaidPlan,
  platformKeyId,
  type PaidPlanId,
} from "@/lib/billing/razorpay-subscriptions";
import { type ActionResult } from "@/features/assessment/actions/shared";

/** Tier rank for the upgrade-only guard (no same-tier or downgrade purchases). */
const PLAN_ORDER: Record<PlanId, number> = { FREE: 0, STARTER: 1, GROWTH: 2, SCALE: 3 };

function toPlanId(value: unknown): PlanId | null {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value) ? (value as PlanId) : null;
}

export interface CheckoutStart {
  subscriptionId: string;
  /** PUBLIC Razorpay key — safe to expose; the client opens Checkout with it. */
  keyId: string;
  /** Hosted Razorpay payment page — the fallback when in-page Checkout can't open. */
  shortUrl: string;
}

/**
 * Create a Razorpay subscription for the acting tenant on a paid tier and return the
 * ids the client needs to open Razorpay Checkout in-page. Upgrade-only: a same-tier or
 * downgrade request is refused. The platform owner (super admin, no tenant) has nothing
 * to subscribe. Nothing is entitled until /verify or the webhook activates it.
 */
export async function startSubscriptionCheckout(planInput: string): Promise<ActionResult<CheckoutStart>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.tenantId) {
    return { ok: false, error: "Select a workspace to subscribe. The platform owner has no tenant subscription." };
  }

  const plan = toPlanId(planInput);
  if (!plan || !isPaidPlan(plan)) return { ok: false, error: "Pick a paid plan (Starter, Growth, or Scale)." };

  const keyId = await platformKeyId();
  if (!keyId) return { ok: false, error: "Payments are not configured. Add Razorpay keys in Settings first." };

  // Upgrade-only: block same-tier / downgrade.
  const current = await resolvePlan(scope.tenantId);
  const currentPlan = current.plan ?? "FREE";
  if (PLAN_ORDER[plan] <= PLAN_ORDER[currentPlan]) {
    return { ok: false, error: `You're already on ${currentPlan} or higher.` };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { id: true, name: true, razorpayCustomerId: true },
  });
  if (!tenant) return { ok: false, error: "Workspace not found." };

  try {
    const { subscriptionId, shortUrl } = await createSubscription(
      { id: tenant.id, name: tenant.name, razorpayCustomerId: tenant.razorpayCustomerId, ownerEmail: scope.user.email },
      plan,
    );
    return { ok: true, data: { subscriptionId, keyId, shortUrl } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start checkout. Please try again." };
  }
}

export interface VerifyInput {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
  plan: string;
}

/**
 * Verify a subscription payment right after Razorpay Checkout succeeds and activate the
 * plan immediately, so the tenant gets access without waiting on the webhook (which the
 * webhook still backstops + owns for renewals). Razorpay signs subscription payments as
 * HMAC_SHA256(payment_id + "|" + subscription_id, key_secret).
 */
export async function verifySubscriptionPayment(input: VerifyInput): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.tenantId) return { ok: false, error: "No workspace." };

  const plan = toPlanId(input.plan);
  if (!plan || !isPaidPlan(plan)) return { ok: false, error: "Invalid plan." };
  if (!input.razorpay_payment_id || !input.razorpay_subscription_id || !input.razorpay_signature) {
    return { ok: false, error: "Missing payment verification fields." };
  }

  const { keySecret } = await resolveRazorpayConfig(null);
  if (!keySecret) return { ok: false, error: "Payment service not configured." };

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.razorpay_payment_id}|${input.razorpay_subscription_id}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(input.razorpay_signature));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "Payment verification failed." };
  }

  // The subscription must belong to THIS tenant (set at creation).
  const sub = await prisma.subscription.findUnique({
    where: { tenantId: scope.tenantId },
    select: { razorpaySubscriptionId: true, razorpayPlanId: true },
  });
  if (sub?.razorpaySubscriptionId !== input.razorpay_subscription_id) {
    return { ok: false, error: "Subscription does not belong to this workspace." };
  }

  // Idempotent: if the webhook already activated at this tier or higher, just confirm.
  const current = await resolvePlan(scope.tenantId);
  if (current.status === "ACTIVE" && PLAN_ORDER[current.plan ?? "FREE"] >= PLAN_ORDER[plan]) {
    return { ok: true };
  }

  await activateSubscription({
    tenantId: scope.tenantId,
    plan: plan as PaidPlanId,
    razorpaySubscriptionId: input.razorpay_subscription_id,
    razorpayPlanId: sub?.razorpayPlanId ?? null,
  });
  revalidatePath("/w/billing");
  return { ok: true };
}
