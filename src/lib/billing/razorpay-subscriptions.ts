import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { razorpayRequest, type RazorpayKeys } from "@/lib/payments/razorpay";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { PLAN_LABEL, PLAN_PRICE_USD, type PlanId } from "@/lib/billing/plans";
import { snapshotFor } from "@/lib/billing/entitlements";

/**
 * SaaS subscription billing on the PLATFORM-OWNER's Razorpay account (USD). Ported
 * from the VidaPulse model: no Plans are hand-made in the Razorpay dashboard — the
 * app creates each Plan via `POST /v1/plans` on the first checkout for a tier and
 * caches it (RazorpayPlan), then creates a Subscription against it. Keys resolve
 * from the platform/Gita settings row (app settings) with env fallback — the SAME
 * account the Gita funnel uses, but a different Razorpay PRIMITIVE (subscriptions,
 * not orders), kept isolated from the Gita INR purchase pipeline.
 */

/** Paid tiers only — FREE has nothing to charge. */
export type PaidPlanId = Exclude<PlanId, "FREE">;
export function isPaidPlan(plan: PlanId): plan is PaidPlanId {
  return plan !== "FREE";
}

/** The platform-owner's Razorpay API keys (app settings singleton → env fallback). */
async function platformKeys(): Promise<RazorpayKeys> {
  const cfg = await resolveRazorpayConfig(null);
  return { keyId: cfg.keyId, keySecret: cfg.keySecret };
}

/** The public key id, for opening Razorpay Checkout in the browser. */
export async function platformKeyId(): Promise<string | null> {
  return (await platformKeys()).keyId;
}

/** An env-pinned Razorpay Plan id for a tier, if the operator set one. */
function planEnvOverride(plan: PaidPlanId): string | null {
  switch (plan) {
    case "STARTER":
      return env.RAZORPAY_PLAN_ID_STARTER ?? null;
    case "GROWTH":
      return env.RAZORPAY_PLAN_ID_GROWTH ?? null;
    case "SCALE":
      return env.RAZORPAY_PLAN_ID_SCALE ?? null;
  }
}

interface RazorpayPlanCreated {
  id: string;
}

/**
 * Get or create the Razorpay Plan id for a tier. Order: env override → cached row
 * (only when its amount still matches the current price) → create via API + cache.
 * A price change invalidates the cache, so a fresh Plan is created at the new price.
 */
export async function getOrCreatePlan(plan: PaidPlanId): Promise<string> {
  const override = planEnvOverride(plan);
  if (override) return override;

  const amountCents = PLAN_PRICE_USD[plan] * 100;
  const cached = await prisma.razorpayPlan.findUnique({ where: { planKey: plan } });
  if (cached && cached.amountCents === amountCents && cached.currency === "USD") {
    return cached.razorpayPlanId;
  }

  const created = await razorpayRequest<RazorpayPlanCreated>("POST", "/v1/plans", await platformKeys(), {
    period: "monthly",
    interval: 1,
    item: {
      name: `Assess360 ${PLAN_LABEL[plan]}`,
      amount: amountCents,
      currency: "USD",
    },
  });

  await prisma.razorpayPlan.upsert({
    where: { planKey: plan },
    create: { planKey: plan, razorpayPlanId: created.id, amountCents, currency: "USD" },
    update: { razorpayPlanId: created.id, amountCents, currency: "USD" },
  });
  return created.id;
}

interface TenantForBilling {
  id: string;
  name: string | null;
  razorpayCustomerId: string | null;
  ownerEmail: string | null;
}

interface RazorpayCustomerCreated {
  id: string;
}

/**
 * Get or create the Razorpay Customer for a tenant (stored on Tenant.razorpayCustomerId
 * so we never duplicate). `fail_existing: "0"` makes Razorpay return the existing
 * customer instead of erroring when the email is already known.
 */
export async function getOrCreateCustomer(tenant: TenantForBilling): Promise<string> {
  if (tenant.razorpayCustomerId) return tenant.razorpayCustomerId;

  const customer = await razorpayRequest<RazorpayCustomerCreated>("POST", "/v1/customers", await platformKeys(), {
    name: tenant.name || tenant.ownerEmail || `Tenant ${tenant.id}`,
    email: tenant.ownerEmail || undefined,
    fail_existing: "0",
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { razorpayCustomerId: customer.id } });
  return customer.id;
}

interface RazorpaySubscriptionCreated {
  id: string;
  short_url: string;
}

export interface CreatedCheckout {
  subscriptionId: string;
  /** Razorpay-hosted payment page — the fallback when in-page Checkout can't open. */
  shortUrl: string;
}

/**
 * Create a Razorpay Subscription for a tenant on a paid tier and return the id +
 * hosted url. Also upserts a PENDING Subscription row (razorpay ids + frozen limits
 * snapshot) so the record exists before payment; entitlement stays FREE until the
 * webhook/verify flips it to ACTIVE. `notes` carry {tenantId, plan} so the webhook
 * can resolve the tenant even when it fires before our row is read.
 */
export async function createSubscription(tenant: TenantForBilling, plan: PaidPlanId): Promise<CreatedCheckout> {
  const [customerId, planId] = await Promise.all([getOrCreateCustomer(tenant), getOrCreatePlan(plan)]);

  const sub = await razorpayRequest<RazorpaySubscriptionCreated>("POST", "/v1/subscriptions", await platformKeys(), {
    plan_id: planId,
    customer_id: customerId,
    quantity: 1,
    total_count: 120, // up to 10 years of monthly cycles — effectively perpetual
    customer_notify: 0, // we handle comms ourselves
    notes: { tenantId: tenant.id, plan },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      plan,
      status: "PENDING",
      razorpaySubscriptionId: sub.id,
      razorpayPlanId: planId,
      limitsSnapshot: snapshotFor(plan),
    },
    update: {
      plan,
      status: "PENDING",
      razorpaySubscriptionId: sub.id,
      razorpayPlanId: planId,
      limitsSnapshot: snapshotFor(plan),
    },
  });

  return { subscriptionId: sub.id, shortUrl: sub.short_url };
}

/** Cancel a Razorpay subscription immediately (used when replacing it on an upgrade). */
export async function cancelRazorpaySubscription(subscriptionId: string): Promise<void> {
  await razorpayRequest("POST", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, await platformKeys(), {
    cancel_at_cycle_end: 0,
  });
}

export interface ActivateInput {
  tenantId: string;
  plan: PaidPlanId;
  razorpaySubscriptionId: string | null;
  razorpayPlanId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
}

/**
 * Activate (or renew) a tenant's paid subscription: freeze the plan's limits, set
 * ACTIVE + the billing period, and set Tenant.plan so resolvePlan reads the paid
 * tier and the gates enforce it. Idempotent — safe to call from both /verify and the
 * webhook. If the tenant had a DIFFERENT active Razorpay subscription, cancel it so
 * an upgrade never leaves two live subscriptions charging.
 */
export async function activateSubscription(input: ActivateInput): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { tenantId: input.tenantId },
    select: { razorpaySubscriptionId: true },
  });
  const prior = existing?.razorpaySubscriptionId ?? null;

  const data = {
    plan: input.plan,
    status: "ACTIVE" as const,
    razorpaySubscriptionId: input.razorpaySubscriptionId,
    razorpayPlanId: input.razorpayPlanId ?? undefined,
    limitsSnapshot: snapshotFor(input.plan),
    ...(input.currentPeriodStart ? { currentPeriodStart: input.currentPeriodStart } : {}),
    ...(input.currentPeriodEnd ? { currentPeriodEnd: input.currentPeriodEnd } : {}),
  };

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { tenantId: input.tenantId },
      create: { tenantId: input.tenantId, ...data, limitsSnapshot: data.limitsSnapshot as Prisma.InputJsonValue },
      update: { ...data, limitsSnapshot: data.limitsSnapshot as Prisma.InputJsonValue },
    }),
    prisma.tenant.update({ where: { id: input.tenantId }, data: { plan: input.plan } }),
  ]);

  if (prior && input.razorpaySubscriptionId && prior !== input.razorpaySubscriptionId) {
    await cancelRazorpaySubscription(prior).catch(() => {});
  }
}

/** Mark a tenant's subscription PAST_DUE (a charge failed; dunning grace keeps plan). */
export async function markPastDue(tenantId: string): Promise<void> {
  await prisma.subscription.updateMany({ where: { tenantId }, data: { status: "PAST_DUE" } });
}

/**
 * End a tenant's subscription (cancelled/completed/halted-terminal): drop it to FREE.
 * entitledPlan already treats CANCELED/HALTED as FREE, and we set Tenant.plan = FREE
 * so every resolver agrees. The frozen snapshot stays for the record.
 */
export async function endSubscription(tenantId: string, status: "CANCELED" | "HALTED"): Promise<void> {
  await prisma.$transaction([
    prisma.subscription.updateMany({ where: { tenantId }, data: { status } }),
    prisma.tenant.update({ where: { id: tenantId }, data: { plan: "FREE" } }),
  ]);
}
