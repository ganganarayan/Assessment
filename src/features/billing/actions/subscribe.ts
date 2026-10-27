"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { resolvePlan } from "@/lib/billing/entitlements";
import { resolvePlatformMetaConfig } from "@/lib/settings/config";
import { firePlatformPurchase } from "@/lib/billing/platform-events";
import {
  isBillingTerm,
  PLAN_IDS,
  PLAN_LABEL,
  PAID_PLAN_NAMES,
  TERM_LABEL,
  type BillingTerm,
  type PlanId,
} from "@/lib/billing/plans";
import {
  createSubscription,
  activateSubscription,
  cancelRazorpaySubscription,
  isPaidPlan,
  paidChargeUsd,
  platformKeyId,
  type PaidPlanId,
} from "@/lib/billing/razorpay-subscriptions";
import { EventType } from "@prisma/client";
import { emitEvent } from "@/lib/events/emit";
import { formatIST } from "@/lib/date";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { buildExitLink } from "@/lib/billing/exit-link";

/**
 * The owner's exit assessment, read WITHOUT a super-admin guard - the person reading it
 * is the customer cancelling, not the owner. Local because it is one column and giving
 * it a home in the platform settings module would mean exporting a reader that skips
 * that module's guard.
 */
async function cancelExitAssessmentUrl(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { cancelExitAssessmentUrl: true },
  });
  return row?.cancelExitAssessmentUrl ?? null;
}

/** Tier rank for the upgrade-only guard (no same-tier or downgrade purchases). */
const PLAN_ORDER: Record<PlanId, number> = { GATE: 1, SIGNAL: 2, AGENCY: 3, ENTERPRISE: 4 };

function toPlanId(value: unknown): PlanId | null {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value) ? (value as PlanId) : null;
}

/** An unrecognised term is monthly, which is the cheaper of the two to charge wrongly. */
function toTerm(value: unknown): BillingTerm {
  return isBillingTerm(value) ? value : "MONTHLY";
}

export interface CheckoutStart {
  subscriptionId: string;
  /** PUBLIC Razorpay key - safe to expose; the client opens Checkout with it. */
  keyId: string;
  /** Hosted Razorpay payment page - the fallback when in-page Checkout can't open. */
  shortUrl: string;
  /** The term the SERVER created the subscription on, echoed back so the modal's own
   *  description cannot disagree with what is about to be charged. */
  term: BillingTerm;
  /** What the card will be charged for this one cycle, whole USD. */
  amountUsd: number;
}

/**
 * Create a Razorpay subscription for the acting tenant on a paid tier and return the
 * ids the client needs to open Razorpay Checkout in-page. The platform owner (super
 * admin, no tenant) has nothing to subscribe. Nothing is entitled until /verify or the
 * webhook activates it.
 *
 * Upgrade-only, with ONE same-tier exception: monthly to yearly on the tier already held.
 * That is a longer commitment at a lower price per month rather than a downgrade, and
 * refusing it - which the rank check did - is what made annual unbuyable for exactly the
 * customers most likely to want it. Yearly back to monthly stays refused like any
 * downgrade: the year has been paid for.
 */
export async function startSubscriptionCheckout(
  planInput: string,
  termInput: string = "MONTHLY",
): Promise<ActionResult<CheckoutStart>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.tenantId) {
    return { ok: false, error: "Select a workspace to subscribe. The platform owner has no tenant subscription." };
  }

  const plan = toPlanId(planInput);
  if (!plan || !isPaidPlan(plan)) return { ok: false, error: `Pick a paid plan (${PAID_PLAN_NAMES}).` };
  const term = toTerm(termInput);

  const keyId = await platformKeyId();
  if (!keyId) return { ok: false, error: "Payments are not configured. Add Razorpay keys in Settings first." };

  const current = await resolvePlan(scope.tenantId);

  // An INTERNAL tenant already has every feature and no caps, and stays that way even
  // with a subscription attached - resolvePlan checks the flag first. Selling it a plan
  // would charge for nothing and change nothing, so refuse before Razorpay is touched.
  if (current.unlimited) {
    return {
      ok: false,
      error: "This workspace is on an internal unlimited plan - there's nothing to upgrade.",
    };
  }

  // Parked or trialing has NO purchased plan, so rank 0 - every tier is an upgrade from
  // there. Using Gate as the fallback would block a parked tenant from buying Gate, which
  // is the one thing they are most likely to want.
  const currentRank = current.plan ? PLAN_ORDER[current.plan] : 0;
  const targetRank = PLAN_ORDER[plan];

  // The term they are on now. A PENDING row from an abandoned checkout must not count,
  // so this is only read when a plan is actually held.
  const held = current.plan
    ? await prisma.subscription.findUnique({ where: { tenantId: scope.tenantId }, select: { term: true } })
    : null;
  const currentTerm = toTerm(held?.term);

  if (targetRank < currentRank) {
    return {
      ok: false,
      error: `You're on ${current.plan}. Moving to a lower plan isn't self-serve - talk to us and we'll sort it.`,
    };
  }
  if (targetRank === currentRank) {
    const switching = term === "YEARLY" && currentTerm === "MONTHLY";
    if (!switching) {
      return {
        ok: false,
        error:
          term === "YEARLY"
            ? `You're already on ${current.plan} billed yearly.`
            : `You're already on ${current.plan}. Moving from yearly back to monthly isn't self-serve - talk to us.`,
      };
    }
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
      term,
    );
    return { ok: true, data: { subscriptionId, keyId, shortUrl, term, amountUsd: paidChargeUsd(plan, term) } };
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

export interface VerifyResult {
  /** So the browser can fire the matching Purchase pixel event (deduped by eventId). */
  purchase?: { eventId: string; value: number; pixelId: string | null };
}

/**
 * Verify a subscription payment right after Razorpay Checkout succeeds and activate the
 * plan immediately, so the tenant gets access without waiting on the webhook (which the
 * webhook still backstops + owns for renewals). Razorpay signs subscription payments as
 * HMAC_SHA256(payment_id + "|" + subscription_id, key_secret).
 */
export async function verifySubscriptionPayment(input: VerifyInput): Promise<ActionResult<VerifyResult>> {
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
    select: { razorpaySubscriptionId: true, razorpayPlanId: true, term: true },
  });
  if (sub?.razorpaySubscriptionId !== input.razorpay_subscription_id) {
    return { ok: false, error: "Subscription does not belong to this workspace." };
  }

  // THE TERM COMES OFF OUR OWN ROW, never from the browser. createSubscription wrote it
  // before Checkout opened, so this is the term the server chose and the one the Razorpay
  // plan was actually built on. Taking it from the client would let a request claim
  // "yearly" against a monthly charge and move the renewal date eleven months out.
  const term = toTerm(sub.term);
  const chargedUsd = paidChargeUsd(plan, term);

  // Idempotent: if the webhook already activated at this tier or higher, just confirm.
  const current = await resolvePlan(scope.tenantId);
  if (current.status === "ACTIVE" && (current.plan ? PLAN_ORDER[current.plan] : 0) >= PLAN_ORDER[plan]) {
    return { ok: true };
  }

  await activateSubscription({
    tenantId: scope.tenantId,
    plan: plan as PaidPlanId,
    term,
    razorpaySubscriptionId: input.razorpay_subscription_id,
    razorpayPlanId: sub?.razorpayPlanId ?? null,
    // The payment id was already here: it was used as the Meta Purchase event id and
    // then dropped. It is the customer's confirmation and the ledger key, so it is
    // kept now, and it is what gives this subscription a paid date and a renewal date
    // without waiting on a webhook that may never come.
    paymentId: input.razorpay_payment_id,
    amountUsd: chargedUsd,
  });

  // SaaS funnel: fire Purchase on the platform pixel (server CAPI), keyed by the
  // Razorpay payment id so the webhook + the browser event dedup to one Purchase.
  // The VALUE is the cycle's charge, so a yearly subscriber reports the year rather than
  // a twelfth of it - the ad account optimises on this number.
  const value = chargedUsd;
  await firePlatformPurchase({
    email: scope.user.email,
    value,
    eventId: input.razorpay_payment_id,
    planLabel: `Assess360 ${PLAN_LABEL[plan]} (${TERM_LABEL[term]})`,
  });
  const { pixelId } = await resolvePlatformMetaConfig();

  revalidatePath("/w/billing");
  return { ok: true, data: { purchase: { eventId: input.razorpay_payment_id, value, pixelId } } };
}

export interface CancelResult {
  /** ISO instant access actually stops - the end of the period already paid for. */
  endsAt: string | null;
  /** The owner's exit assessment, when one is configured. The caller sends them here. */
  exitAssessmentUrl: string | null;
  /** The sentence to show, which states the date rather than that a write happened. */
  summary: string;
}

/**
 * Cancel the acting workspace's subscription AT THE END OF THE PERIOD IT HAS PAID FOR.
 *
 * 🔴 WHY THIS EXISTS. /refund says "You can cancel at any time from your account" and
 * "cancel before the renewal date and you are not charged again". Neither was true:
 * there was no cancel action, route or button anywhere, and `cancelAtPeriodEnd` was a
 * column nothing ever wrote. A customer who wanted out had to email and wait. A
 * published policy the product does not implement is the one billing defect that is
 * also a promise.
 *
 * Cycle-end, never immediate: they keep what they bought until the renewal date, and
 * Razorpay fires subscription.cancelled when it arrives, which the existing webhook
 * already turns into endSubscription. Nothing here parks the tenant - doing that now
 * would take away a period they paid for.
 *
 * 🔴 IT CANNOT BE UNDONE. Razorpay has no resume for a cycle-end cancellation, so the
 * caller must say so BEFORE confirming.
 *
 * The exit assessment is returned rather than redirected to: the cancellation is already
 * booked by then, and a survey must never be able to fail the thing it comes after.
 */
export async function cancelSubscription(): Promise<ActionResult<CancelResult>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.tenantId) {
    return { ok: false, error: "Select a workspace first. The platform owner has no subscription to cancel." };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: {
      id: true,
      slug: true,
      name: true,
      agencyAdminTenantId: true,
      subscription: {
        select: { plan: true, status: true, razorpaySubscriptionId: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
      },
    },
  });
  if (!tenant) return { ok: false, error: "Workspace not found." };

  // A client workspace is paid for by its agency admin and has no subscription of its
  // own. Letting this run would report success having cancelled nothing.
  if (tenant.agencyAdminTenantId) {
    return {
      ok: false,
      error: "This client workspace is billed to the agency that created it. Ask them to make the change.",
    };
  }

  const sub = tenant.subscription;
  if (!sub || !sub.razorpaySubscriptionId) {
    return { ok: false, error: "There is no paid subscription on this workspace to cancel." };
  }
  if (sub.status === "CANCELED" || sub.status === "HALTED") {
    return { ok: false, error: "This subscription has already ended." };
  }
  if (sub.cancelAtPeriodEnd) {
    return { ok: false, error: "This subscription is already set to stop at the end of the period." };
  }

  try {
    await cancelRazorpaySubscription(sub.razorpaySubscriptionId, true);
  } catch (e) {
    console.error("[billing] cancel failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Razorpay would not accept the cancellation. Nothing has changed - try again, or contact support." };
  }

  // Only after Razorpay has accepted it. Writing first would leave the workspace
  // believing it had cancelled while the card kept being charged, which is the one
  // direction this must never fail in.
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { cancelAtPeriodEnd: true },
  });

  // The exit survey, with the cancelling customer's own identity signed into the link.
  // Without it they land on a cold opt-in form and are asked to type the email the
  // product has had on file for months, which is where somebody who has just quit
  // closes the tab.
  const exitAssessmentUrl = buildExitLink(await cancelExitAssessmentUrl(), {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    firstName: scope.user.name ?? null,
    email: scope.user.email ?? null,
  });
  const endsAt = sub.currentPeriodEnd ?? null;

  // The owner's CRM hears this, not the workspace's: a tenant has no use for a webhook
  // about its own cancellation. Platform scope (no tenant) is what routes it there.
  await emitEvent(EventType.SUBSCRIPTION_CANCELLED, {
    lead: { email: scope.user.email, firstName: scope.user.name ?? null },
    subscription: {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      plan: sub.plan,
      planLabel: PLAN_LABEL[sub.plan as PlanId] ?? sub.plan,
      endsAt: endsAt?.toISOString() ?? null,
      exitAssessmentUrl,
    },
  }).catch((e: unknown) => {
    // The cancellation is already booked with Razorpay and written here. A webhook that
    // did not go out is a notification problem, never a reason to tell somebody their
    // cancellation failed.
    console.error("[billing] cancel event failed:", e instanceof Error ? e.message : String(e));
  });

  revalidatePath("/w/billing");
  return {
    ok: true,
    data: {
      endsAt: endsAt?.toISOString() ?? null,
      exitAssessmentUrl,
      summary: endsAt
        ? `Cancelled. Your plan stays active until ${formatIST(endsAt).split(",")[0]}, and you will not be charged again.`
        : "Cancelled. You will not be charged again.",
    },
  };
}
