import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { nextRenewal } from "@/lib/billing/renewal";
import { razorpayRequest, type RazorpayKeys } from "@/lib/payments/razorpay";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import {
  agencyTenantExtraUsd,
  chargeUsd,
  MONTHS_PER_YEAR,
  PLAN_LABEL,
  TERM_LABEL,
  type BillingTerm,
  type PlanId,
} from "@/lib/billing/plans";
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

/**
 * What a chargeable tier costs for one cycle on a term, in whole USD.
 *
 * Throws rather than returning a fallback, because every fallback price here is the wrong
 * price: a yearly charge quoted at the monthly figure undercharges by twelve, and the
 * other direction overcharges by twelve. It can only throw for a tier with no published
 * annual price, which is Enterprise alone - and Enterprise is not a PaidPlanId, so the
 * throw is unreachable from the paths that take money. It exists so that adding a tier
 * without an annual price fails loudly at checkout instead of charging the wrong amount.
 */
export function paidChargeUsd(plan: PaidPlanId, term: BillingTerm): number {
  const usd = chargeUsd(plan, term);
  if (usd === null) throw new Error(`No ${TERM_LABEL[term]} price is published for ${plan}.`);
  return usd;
}

/**
 * The RazorpayPlan cache key for a tier on a term.
 *
 * 🔴 MONTHLY KEEPS THE BARE TIER NAME. The rows cached before annual existed are keyed
 * "GATE", "SIGNAL", "AGENCY", and they are monthly plans; suffixing both terms would
 * orphan them and create a second monthly plan at the same price on the next checkout.
 * Only the new term carries a suffix.
 */
export function planCacheKey(plan: PaidPlanId, term: BillingTerm): string {
  return term === "YEARLY" ? `${plan}_YEARLY` : plan;
}

/** Razorpay's own period word, and how many cycles 10 years is. */
function razorpayCycle(term: BillingTerm): { period: "monthly" | "yearly"; totalCount: number } {
  return term === "YEARLY"
    ? { period: "yearly", totalCount: 10 }
    : { period: "monthly", totalCount: 120 };
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
 * a problem. The price now has exactly one source, chargeUsd, and the credentials come
 * from Settings (platformKeys, below).
 *
 * ONE PLAN PER TIER PER TERM. Razorpay prices a plan, not a subscription, and a plan's
 * period is fixed at creation, so monthly and yearly are two different Razorpay plans
 * and two different cache rows.
 */
export async function getOrCreatePlan(plan: PaidPlanId, term: BillingTerm = "MONTHLY"): Promise<string> {
  const amountCents = paidChargeUsd(plan, term) * 100;
  const planKey = planCacheKey(plan, term);
  const { period } = razorpayCycle(term);

  const cached = await prisma.razorpayPlan.findUnique({ where: { planKey } });
  if (cached && cached.amountCents === amountCents && cached.currency === "USD") {
    return cached.razorpayPlanId;
  }

  const created = await razorpayRequest<RazorpayPlanCreated>("POST", "/plans", await platformKeys(), {
    period,
    interval: 1,
    item: {
      name: `Assess360 ${PLAN_LABEL[plan]} (${TERM_LABEL[term]})`,
      amount: amountCents,
      currency: "USD",
    },
  });

  await prisma.razorpayPlan.upsert({
    where: { planKey },
    create: { planKey, razorpayPlanId: created.id, amountCents, currency: "USD" },
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
 * hosted url. Also upserts a PENDING Subscription row (razorpay ids + term + frozen
 * limits snapshot) so the record exists before payment; entitlement stays FREE until the
 * webhook/verify flips it to ACTIVE. `notes` carry {tenantId, plan, term} so the webhook
 * can resolve all three even when it fires before our row is read.
 *
 * THE TERM IS WRITTEN HERE, BEFORE THE MONEY. /verify reads it back off this row rather
 * than taking it from the browser, so the term that decides the renewal date and the
 * usage window is one the server chose.
 */
export async function createSubscription(
  tenant: TenantForBilling,
  plan: PaidPlanId,
  term: BillingTerm = "MONTHLY",
): Promise<CreatedCheckout> {
  const [customerId, planId] = await Promise.all([
    getOrCreateCustomer(tenant),
    getOrCreatePlan(plan, term),
  ]);
  const { totalCount } = razorpayCycle(term);

  const sub = await razorpayRequest<RazorpaySubscriptionCreated>("POST", "/subscriptions", await platformKeys(), {
    plan_id: planId,
    customer_id: customerId,
    quantity: 1,
    total_count: totalCount, // 10 years of cycles either way - effectively perpetual
    customer_notify: 0, // we handle comms ourselves
    notes: { tenantId: tenant.id, plan, term },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      plan,
      term,
      status: "PENDING",
      razorpaySubscriptionId: sub.id,
      razorpayPlanId: planId,
      limitsSnapshot: snapshotFor(plan),
    },
    update: {
      plan,
      term,
      status: "PENDING",
      razorpaySubscriptionId: sub.id,
      razorpayPlanId: planId,
      limitsSnapshot: snapshotFor(plan),
    },
  });

  return { subscriptionId: sub.id, shortUrl: sub.short_url };
}

/**
 * Cancel a Razorpay subscription.
 *
 * `atCycleEnd` false ends it NOW, which is right when one subscription replaces another
 * on an upgrade - the customer is already paying for the new one.
 *
 * `atCycleEnd` true is what a CUSTOMER cancelling means: they keep what they paid for
 * until the period ends, and Razorpay fires subscription.cancelled when it does. The
 * refund policy promises exactly this ("cancel before the renewal date and you are not
 * charged again"), and ending it immediately would take away a period already paid for.
 *
 * 🔴 RAZORPAY HAS NO RESUME. A cycle-end cancellation cannot be revoked through the API,
 * so anything offering this must say so before it is confirmed, not after.
 */
export async function cancelRazorpaySubscription(
  subscriptionId: string,
  atCycleEnd = false,
): Promise<void> {
  await razorpayRequest("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, await platformKeys(), {
    cancel_at_cycle_end: atCycleEnd ? 1 : 0,
  });
}

export interface ActivateInput {
  tenantId: string;
  plan: PaidPlanId;
  /**
   * Monthly or yearly. REQUIRED, with no default, on purpose: a default would be read as
   * MONTHLY by whichever caller forgot it, and a yearly subscription activated as monthly
   * gets a renewal date eleven months early and a usage window keyed the wrong way. Every
   * caller already knows the answer - the webhook from its notes, /verify from the row.
   */
  term: BillingTerm;
  razorpaySubscriptionId: string | null;
  razorpayPlanId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  /**
   * The Razorpay payment id of the charge that caused this activation.
   *
   * Both callers have it and neither used to keep it: /verify had it as the Meta
   * Purchase event id and threw it away, and the webhook carries it in the payload.
   * It is the confirmation a customer quotes back, so it is stored, and it is what
   * dedups the Payment ledger row.
   */
  paymentId?: string | null;
  /** When the charge happened. Defaults to now, which is true for both callers. */
  paidAt?: Date | null;
  /** What was charged, in whole USD. Written to the ledger row, never displayed from here. */
  amountUsd?: number | null;
  /** card / upi / netbanking, when the provider said. */
  method?: string | null;
}

/**
 * Activate (or renew) a tenant's paid subscription: freeze the plan's limits, set
 * ACTIVE + the billing period + the term, and set Tenant.plan so resolvePlan reads the
 * paid tier and the gates enforce it. Idempotent - safe to call from both /verify and the
 * webhook. If the tenant had a DIFFERENT active Razorpay subscription, cancel it so
 * an upgrade never leaves two live subscriptions charging.
 *
 * That cancellation is also how a TERM SWITCH works: Razorpay cannot move a subscription
 * between plans, so monthly-to-yearly is a new subscription here and the old one is
 * cancelled the moment the new one is paid. Nobody is charged twice, and nothing
 * pro-rates the days left on the monthly cycle, which is why the UI has to say so before
 * the switch is confirmed.
 */
export async function activateSubscription(input: ActivateInput): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { tenantId: input.tenantId },
    select: { razorpaySubscriptionId: true },
  });
  const prior = existing?.razorpaySubscriptionId ?? null;

  // The billing record the app owns. Computed here rather than copied from Razorpay,
  // so it exists whether or not a webhook ever arrives - see lib/billing/renewal.ts.
  const paidAt = input.paidAt ?? new Date();

  const data = {
    plan: input.plan,
    term: input.term,
    status: "ACTIVE" as const,
    razorpaySubscriptionId: input.razorpaySubscriptionId,
    razorpayPlanId: input.razorpayPlanId ?? undefined,
    limitsSnapshot: snapshotFor(input.plan),
    paidAt,
    // A yearly subscription renews in twelve months, not one. nextRenewal takes the
    // month count, so there is one implementation of the month-end clamp for both.
    renewsAt: nextRenewal(paidAt, input.term === "YEARLY" ? MONTHS_PER_YEAR : 1),
    ...(input.paymentId ? { lastPaymentId: input.paymentId } : {}),
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

  // THE LEDGER ROW, after the entitlement is already committed. A subscription that
  // activates but fails to record its payment is a bookkeeping problem; one that
  // records a payment and fails to activate is a customer who paid for nothing. So
  // the money is written second, and never in a way that can throw back at the caller.
  //
  // Keyed on the Razorpay payment id, which is unique, so the webhook and /verify
  // firing for the same charge produce ONE row rather than two.
  if (input.paymentId) {
    await prisma.payment
      .upsert({
        where: { providerPaymentId: input.paymentId },
        create: {
          providerPaymentId: input.paymentId,
          provider: "razorpay",
          purpose: "subscription",
          plan: input.plan,
          tenantId: input.tenantId,
          status: "captured",
          method: input.method ?? null,
          currency: "USD",
          // `amount` is the paise column for INR funnel payments. Subscriptions are
          // billed in USD, so this holds CENTS, which the Accounts page divides by 100
          // with the currency beside it rather than guessing from the number.
          amount: input.amountUsd != null ? Math.round(input.amountUsd * 100) : null,
          notes: { razorpaySubscriptionId: input.razorpaySubscriptionId ?? null },
        },
        update: {},
      })
      .catch(() => {});
  }

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

/**
 * RazorpayPlan cache key for the slot plan, PER TIER - an extra client workspace is $29
 * on Agency and $25 on Enterprise (owner, 2026-10-14), and Razorpay prices a plan, not a
 * subscription, so two prices mean two plans.
 *
 * Not a PlanId: these are not tiers, they are the add-on sold alongside one.
 */
export const slotPlanKey = (plan: PlanId): string => `AGENCY_TENANT_SLOT_${plan}`;

/** The pre-2026-10-14 single-price key. Kept so the old cached row is never reused at
 *  the wrong price, and so a reader meeting it in the table knows what it was. */
export const LEGACY_SLOT_PLAN_KEY = "AGENCY_TENANT_SLOT";

/** notes.kind on the slot subscription, so the webhook can tell the two apart. */
export const SLOT_NOTE_KIND = "agency_tenant_slots";

/**
 * Get or create the $29 monthly Razorpay Plan the slots are charged against. Same
 * cache-and-invalidate-on-price-change shape as getOrCreatePlan: change
 * the tier's price in AGENCY_TENANT_EXTRA_USD and the next purchase creates a plan at
 * the new price, leaving the subscribers already on the old one where they are.
 */
export async function getOrCreateSlotPlan(plan: PlanId): Promise<string> {
  const amountCents = agencyTenantExtraUsd(plan) * 100;
  const planKey = slotPlanKey(plan);
  const cached = await prisma.razorpayPlan.findUnique({ where: { planKey } });
  if (cached && cached.amountCents === amountCents && cached.currency === "USD") {
    return cached.razorpayPlanId;
  }
  const created = await razorpayRequest<RazorpayPlanCreated>("POST", "/plans", await platformKeys(), {
    period: "monthly",
    interval: 1,
    item: {
      name: `Assess360 client workspace (${PLAN_LABEL[plan]})`,
      amount: amountCents,
      currency: "USD",
    },
  });
  await prisma.razorpayPlan.upsert({
    where: { planKey },
    create: { planKey, razorpayPlanId: created.id, amountCents, currency: "USD" },
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
  /** The buyer's TIER, which sets the price of a slot. */
  plan: PlanId,
): Promise<CreatedCheckout> {
  const [customerId, planId] = await Promise.all([getOrCreateCustomer(tenant), getOrCreateSlotPlan(plan)]);
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
