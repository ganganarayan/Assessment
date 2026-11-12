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
  testAmountText,
} from "@/lib/billing/razorpay-subscriptions";
import { sendBillingEmail } from "@/lib/billing/billing-email";
import { forgetTenantActive } from "@/lib/tenant/active";
import { isPlatformTenant } from "@/lib/tenant/platform-tenant";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The super-admin Rs 1.x test rows (owner, 12-11-2026). Every action takes the target
 * workspace explicitly rather than the acting cookie, so the owner can test any workspace
 * from one screen without entering it.
 *
 * Subscribe and upgrade open a REAL Razorpay checkout at the tier's test amount and go
 * through the same activation a customer's payment does. Downgrade switches the live
 * subscription to the cheaper test plan with no charge. Cancel ends it NOW (a customer's
 * cancel waits for the period end) so the owner can watch the features switch off.
 */

const RANK: Record<PlanId, number> = { GATE: 1, SIGNAL: 2, AGENCY: 3, ENTERPRISE: 4 };

function toPlanId(v: unknown): PlanId | null {
  return typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v) ? (v as PlanId) : null;
}

/** A workspace the test may act on: real, billed on its own, not the platform, not internal. */
async function testTarget(tenantId: string) {
  if (!tenantId || isPlatformTenant(tenantId)) return { error: "Pick a workspace first." } as const;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, unlimited: true, agencyAdminTenantId: true, deletedAt: true, razorpayCustomerId: true },
  });
  if (!tenant || tenant.deletedAt) return { error: "Workspace not found." } as const;
  if (tenant.unlimited) return { error: "That workspace is internal (unlimited), so a plan changes nothing on it. Pick another." } as const;
  if (tenant.agencyAdminTenantId) return { error: "That is a client workspace billed to its agency. Pick the agency or a standalone workspace." } as const;
  const owner = await prisma.user.findFirst({
    where: { tenantId, deletedAt: null, staffPermission: null },
    orderBy: { createdAt: "asc" },
    select: { email: true, name: true },
  });
  return { tenant, owner } as const;
}

export interface TestCheckoutStart {
  subscriptionId: string;
  keyId: string;
  shortUrl: string;
  amountText: string;
  prefill: { name: string; email: string };
}

/** Subscribe or upgrade: open a real checkout at the tier's test amount. */
export async function startTestCheckout(tenantId: string, planInput: string): Promise<ActionResult<TestCheckoutStart>> {
  await requireSuperAdmin();
  const plan = toPlanId(planInput);
  if (!plan) return { ok: false, error: "Unknown plan." };
  const t = await testTarget(tenantId);
  if ("error" in t) return { ok: false, error: t.error ?? "Workspace not usable." };

  const keyId = await platformKeyId();
  if (!keyId) return { ok: false, error: "Platform Razorpay keys are not set (Settings, Payments)." };

  const current = await resolvePlan(tenantId);
  const held = current.status === "ACTIVE" || current.status === "PAST_DUE" ? current.plan : null;
  if (held && RANK[plan] <= RANK[held]) {
    return { ok: false, error: `${PLAN_LABEL[held]} is held already. Use Downgrade for a lower plan.` };
  }

  try {
    const { subscriptionId, shortUrl } = await createTestSubscription(
      {
        id: t.tenant.id,
        name: t.tenant.name,
        razorpayCustomerId: t.tenant.razorpayCustomerId,
        ownerEmail: t.owner?.email ?? null,
      },
      plan,
    );
    return {
      ok: true,
      data: {
        subscriptionId,
        keyId,
        shortUrl,
        amountText: testAmountText(plan),
        prefill: { name: t.owner?.name ?? "", email: t.owner?.email ?? "" },
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Razorpay would not open the checkout." };
  }
}

export interface TestVerifyInput {
  tenantId: string;
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
    where: { tenantId: input.tenantId },
    select: { razorpaySubscriptionId: true, razorpayPlanId: true, pendingPlan: true },
  });
  if (sub?.razorpaySubscriptionId !== input.razorpay_subscription_id) {
    return { ok: false, error: "That subscription does not belong to this workspace." };
  }
  const plan = toPlanId(sub.pendingPlan);
  if (!plan) return { ok: false, error: "Paid, but the plan it was for is not recorded. The webhook will settle it." };

  await activateSubscription({
    tenantId: input.tenantId,
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

/** Downgrade: switch the live test subscription to the lower tier's plan, nothing charged today. */
export async function downgradeTestSubscription(tenantId: string, planInput: string): Promise<ActionResult<{ summary: string }>> {
  await requireSuperAdmin();
  const plan = toPlanId(planInput);
  if (!plan) return { ok: false, error: "Unknown plan." };
  const t = await testTarget(tenantId);
  if ("error" in t) return { ok: false, error: t.error ?? "Workspace not usable." };

  const current = await resolvePlan(tenantId);
  const held = current.status === "ACTIVE" || current.status === "PAST_DUE" ? current.plan : null;
  if (!held || RANK[plan] >= RANK[held]) {
    return { ok: false, error: "Downgrade needs a paid plan above this one. Subscribe first." };
  }

  try {
    await switchTestSubscriptionPlan(tenantId, plan);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Razorpay refused the plan change: ${msg}. Razorpay only allows changing the plan on a subscription paid by card, so subscribe again with a card if this one was UPI.`,
    };
  }

  const row = await prisma.subscription.findUnique({ where: { tenantId }, select: { renewsAt: true } });
  await sendBillingEmail({
    tenantId,
    kind: "downgraded",
    plan,
    noChargeToday: true,
    renewsAt: row?.renewsAt ?? null,
  });
  revalidatePath("/admin/test-payments");
  return {
    ok: true,
    data: { summary: `Now on ${PLAN_LABEL[plan]}. Nothing charged today; ${testAmountText(plan)} from the next renewal.` },
  };
}

/**
 * Cancel NOW: Razorpay stops charging, the plan ends, the workspace parks. Both the
 * current id and any replaced-but-not-yet-cancelled one are cancelled, because an
 * abandoned checkout leaves the row pointing at an unpaid subscription while the paid
 * one is the one still charging.
 */
export async function cancelTestSubscription(tenantId: string): Promise<ActionResult<{ summary: string }>> {
  await requireSuperAdmin();
  const t = await testTarget(tenantId);
  if ("error" in t) return { ok: false, error: t.error ?? "Workspace not usable." };

  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { plan: true, status: true, razorpaySubscriptionId: true, priorRazorpaySubscriptionId: true },
  });
  if (!sub?.razorpaySubscriptionId) return { ok: false, error: "There is no subscription on this workspace to cancel." };
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

  await endSubscription(tenantId, "CANCELED");
  await prisma.subscription.update({
    where: { tenantId },
    data: { cancelAtPeriodEnd: false, priorRazorpaySubscriptionId: null, pendingPlan: null, pendingTerm: null },
  });
  forgetTenantActive(tenantId);

  const plan = toPlanId(sub.plan) ?? "GATE";
  await sendBillingEmail({ tenantId, kind: "cancelled", plan, endsAt: null });
  revalidatePath("/admin/test-payments");
  return { ok: true, data: { summary: `Cancelled. ${PLAN_LABEL[plan]} features are off and nothing more will be charged.` } };
}
