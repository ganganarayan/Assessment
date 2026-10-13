import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { razorpayRequest, type RazorpayKeys } from "@/lib/payments/razorpay";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { AGENCY_TENANT_EXTRA_USD, PLAN_LABEL, PLAN_PRICE_USD, type PlanId } from "@/lib/billing/plans";
import { snapshotFor } from "@/lib/billing/entitlements";

/**
 * SaaS subscription billing on the PLATFORM-OWNER's Razorpay account (USD). Ported
 * from the VidaPulse model: no Plans are hand-made in the Razorpay dashboard - the
 * app creates each Plan via `POST /v1/plans` on the first checkout for a tier and
 * caches it (RazorpayPlan), then creates a Subscription against it. Keys resolve
 * from the platform/Gita settings row (app settings) with env fallback - the SAME
 * account the Gita funnel uses, but a different Razorpay PRIMITIVE (subscriptions,
 * not orders), kept isolated from the Gita INR purchase pipeline.
 */

/**
 * Chargeable tiers. Enterprise is excluded: it is published as "from $599" and sold by
 * negotiation, so there is no fixed Razorpay plan to charge against - quoting one would
 * be the flat number the pricing deliberately avoids.
 */
export type PaidPlanId = Exclude<PlanId, "ENTERPRISE">;
export function isPaidPlan(plan: PlanId): plan is PaidPlanId {
  return plan !== "ENTERPRISE";
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

interface RazorpayPlanCreated {
  id: string;
}

/**
 * Get or create the Razorpay Plan id for a tier. Order: cached row (only when its amount
 * still matches the current price) → create via API + cache. A price change invalidates
 * the cache, so a fresh Plan is created at the new price and the old one is simply left
 * behind for the subscribers already on it.
 *
 * 🔴 THERE IS NO ENV OVERRIDE ANY MORE (removed 2026-10-13). Six RAZORPAY_PLAN_ID_* vars
 * used to be read ahead of everything here, and none of them was ever set in any
 * environment. What they created was a way for the published price and the charged price
 * to disagree in silence: pin a tier to a Plan made at an old amount, change the catalog,
 * and the page says $249 while the card is charged $199 with nothing anywhere reporting
 * a problem. The price now has exactly one source, PLAN_PRICE_USD, and the credentials
 * come from Settings (platformKeys, below).
 */
export async function getOrCreatePlan(plan: PaidPlanId): Promise<string> {
  const amountCents = PLAN_PRICE_USD[plan] * 100;
  const cached = await prisma.razorpayPlan.findUnique({ where: { planKey: plan } });
  if (cached && cached.amountCents === amountCents && cached.currency === "USD") {
    return cached.razorpayPlanId;
  }

  const created = await razorpayRequest<RazorpayPlanCreated>("POST", "/plans", await platformKeys(), {
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

export interface TenantForBilling {
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

  const customer = await razorpayRequest<RazorpayCustomerCreated>("POST", "/customers", await platformKeys(), {
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
  /** Razorpay-hosted payment page - the fallback when in-page Checkout can't open. */
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

  const sub = await razorpayRequest<RazorpaySubscriptionCreated>("POST", "/subscriptions", await platformKeys(), {
    plan_id: planId,
    customer_id: customerId,
    quantity: 1,
    total_count: 120, // up to 10 years of monthly cycles - effectively perpetual
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
  await razorpayRequest("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, await platformKeys(), {
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
 * tier and the gates enforce it. Idempotent - safe to call from both /verify and the
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
 * entitledPlan returns null for CANCELED/HALTED - the tenant becomes PARKED, since
 * there is no free tier to fall back to any more. Tenant.plan is deliberately NOT
 * rewritten: resolution reads the subscription, and stamping a dead catalog value on the
 * tenant only creates a second, disagreeing answer. The frozen snapshot stays for the record.
 */
export async function endSubscription(tenantId: string, status: "CANCELED" | "HALTED"): Promise<void> {
  await prisma.subscription.updateMany({ where: { tenantId }, data: { status } });
}

/* ---------------------------------------------------------------------------
 * AGENCY-TENANT SLOTS - the $29/mo workspaces beyond the plan's included count
 *
 * 🔴 WHY A SECOND SUBSCRIPTION AND NOT A QUANTITY ON THE FIRST. Razorpay multiplies a
 * subscription's quantity by its plan amount, so quantity 2 on the Agency plan charges
 * $498, not $249 + $29. The slots therefore ride their own monthly plan at $29 with the
 * quantity on THAT subscription, and a tenant can hold two live Razorpay subscriptions
 * at once: the tier, and the slots.
 *
 * Everything downstream has to know the difference, which is what notes.kind is for:
 * the webhook resolves a slot event by it and must never route one into
 * activateSubscription, or the tier's razorpaySubscriptionId would be overwritten with
 * the slot subscription's id and the tier would stop renewing.
 * ------------------------------------------------------------------------- */

/** RazorpayPlan cache key for the slot plan. Not a PlanId - it is not a tier. */
export const SLOT_PLAN_KEY = "AGENCY_TENANT_SLOT";

/** notes.kind on the slot subscription, so the webhook can tell the two apart. */
export const SLOT_NOTE_KIND = "agency_tenant_slots";

/**
 * Get or create the $29 monthly Razorpay Plan the slots are charged against. Same
 * cache-and-invalidate-on-price-change shape as getOrCreatePlan: change
 * AGENCY_TENANT_EXTRA_USD and the next purchase creates a plan at the new price, leaving
 * the subscribers already on the old one where they are.
 */
export async function getOrCreateSlotPlan(): Promise<string> {
  const amountCents = AGENCY_TENANT_EXTRA_USD * 100;
  const cached = await prisma.razorpayPlan.findUnique({ where: { planKey: SLOT_PLAN_KEY } });
  if (cached && cached.amountCents === amountCents && cached.currency === "USD") {
    return cached.razorpayPlanId;
  }
  const created = await razorpayRequest<RazorpayPlanCreated>("POST", "/plans", await platformKeys(), {
    period: "monthly",
    interval: 1,
    item: {
      name: "Assess360 client workspace",
      amount: amountCents,
      currency: "USD",
    },
  });
  await prisma.razorpayPlan.upsert({
    where: { planKey: SLOT_PLAN_KEY },
    create: { planKey: SLOT_PLAN_KEY, razorpayPlanId: created.id, amountCents, currency: "USD" },
    update: { razorpayPlanId: created.id, amountCents, currency: "USD" },
  });
  return created.id;
}

/**
 * Open the FIRST slot purchase: a new Razorpay subscription at quantity 1, paid now
 * through Checkout. The id is stored on the tenant's existing Subscription row
 * immediately so the webhook can find it, but extraAgencyTenants stays where it is -
 * the count follows the money, and nothing has been charged yet.
 */
export async function createSlotSubscription(
  tenant: TenantForBilling,
  quantity: number,
): Promise<CreatedCheckout> {
  const [customerId, planId] = await Promise.all([getOrCreateCustomer(tenant), getOrCreateSlotPlan()]);
  const sub = await razorpayRequest<RazorpaySubscriptionCreated>("POST", "/subscriptions", await platformKeys(), {
    plan_id: planId,
    customer_id: customerId,
    quantity,
    total_count: 120,
    customer_notify: 0,
    notes: { tenantId: tenant.id, kind: SLOT_NOTE_KIND },
  });
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { razorpaySlotSubscriptionId: sub.id },
  });
  return { subscriptionId: sub.id, shortUrl: sub.short_url };
}

/**
 * Change the quantity on an existing slot subscription.
 *
 * `when` is the whole design, and the two directions are deliberately asymmetric:
 *  - "now" for an INCREASE. The workspace is usable immediately and the difference lands
 *    on the next invoice. The owner's requirement was that paying raises the cap at once,
 *    and arrears pro-ration is the standard way to do that without a second charge flow.
 *  - "cycle_end" for a DECREASE. They paid for the period, so they keep the slot until
 *    it ends; the count then follows the next charged event rather than a date we hold.
 */
export async function updateSlotQuantity(
  subscriptionId: string,
  quantity: number,
  when: "now" | "cycle_end",
): Promise<void> {
  await razorpayRequest("PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}`, await platformKeys(), {
    quantity,
    schedule_change_at: when,
  });
}

/**
 * Record the slots a tenant has PAID for. Called by the verify path and, as the source
 * of truth, by the webhook on every charge - so a quantity changed in the Razorpay
 * dashboard converges here too.
 */
export async function setPaidSlots(tenantId: string, quantity: number): Promise<void> {
  await prisma.subscription.updateMany({
    where: { tenantId },
    data: { extraAgencyTenants: Math.max(0, Math.trunc(quantity)) },
  });
}

/**
 * The slot subscription ended (cancelled, completed or halted): the extras are gone.
 *
 * 🟡 This can drop an agency below the number of workspaces they are running. Nothing
 * is deleted and nothing is taken away from the client workspaces themselves - the cap
 * simply refuses the next create, exactly as it would for any over-limit account, and
 * the agency screen shows "6 of 5".
 */
export async function clearPaidSlots(tenantId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { tenantId },
    data: { extraAgencyTenants: 0, razorpaySlotSubscriptionId: null },
  });
}
