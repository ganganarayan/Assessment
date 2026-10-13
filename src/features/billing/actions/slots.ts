"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser, isSuperAdmin, currentUserCanEdit } from "@/lib/auth/guards";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { resolvePlan } from "@/lib/billing/entitlements";
import { agencyTenantUsage } from "@/lib/billing/gate";
import { AGENCY_TENANT_EXTRA_USD } from "@/lib/billing/plans";
import {
  createSlotSubscription,
  updateSlotQuantity,
  setPaidSlots,
  cancelRazorpaySubscription,
  platformKeyId,
} from "@/lib/billing/razorpay-subscriptions";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * CLIENT-WORKSPACE SLOTS - buying an agency tenant beyond the plan's included count.
 *
 * The money shape is in razorpay-subscriptions.ts (a second $29 subscription carrying
 * the quantity, because quantity on the tier plan would multiply the tier price). This
 * module is the guarded, human-facing half: who may buy, what the count may never go
 * below, and what the screen is told afterwards.
 *
 * 🔴 Every action resolves the caller's OWN workspace, never the one they have entered.
 * An agency admin standing inside a client workspace must not be able to buy a slot
 * "for" that workspace - there is no such thing, the hierarchy is one level deep, and
 * the subscription belongs to the agency.
 */

/** What the screen does next after an add. */
export type SlotPurchase =
  /** A first slot: pay now, through Razorpay Checkout. */
  | { kind: "checkout"; subscriptionId: string; keyId: string; shortUrl: string; quantity: number }
  /** A further slot on an existing slot subscription: available now, billed next cycle. */
  | { kind: "added"; quantity: number };

async function agencyBillingScope(): Promise<
  | { ok: true; tenantId: string; email: string }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  if (isSuperAdmin(user)) {
    return { ok: false, error: "The platform owner has no subscription to add workspaces to." };
  }
  if (!(await currentUserCanEdit())) {
    return { ok: false, error: "You have view-only access - ask an admin for edit rights." };
  }
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true, tenant: { select: { deletedAt: true, agencyAdminTenantId: true } } },
  });
  const own = fresh?.tenantId ?? null;
  if (!own || fresh?.tenant?.deletedAt) return { ok: false, error: "You have no workspace." };
  if (fresh?.tenant?.agencyAdminTenantId) {
    return {
      ok: false,
      error: "This workspace is managed by an agency - they add workspaces, not you.",
    };
  }
  return { ok: true, tenantId: own, email: user.email };
}

/**
 * Buy one more client workspace.
 *
 * Two paths, and the difference is whether a slot subscription already exists:
 *  - none yet: a new $29 subscription at quantity 1, paid in Checkout now. The cap
 *    rises when the payment verifies (or when the webhook lands, whichever is first).
 *  - one already: its quantity goes up by one, effective immediately, billed on the next
 *    invoice. The cap rises here, in this call, which is what "instant" means.
 */
export async function addAgencyTenantSlot(): Promise<ActionResult<SlotPurchase>> {
  const scope = await agencyBillingScope();
  if (!scope.ok) return { ok: false, error: scope.error };

  const resolved = await resolvePlan(scope.tenantId);
  // 🔴 Only a workspace whose PLAN resells may buy extras. Without this a Gate customer
  // could buy a $29 workspace slot that resolvePlan would then refuse to honour, because
  // the extras are only added to a plan that includes at least one (agencyTenantUsage).
  // Taking money for a capability the resolver will not grant is the worst of the
  // possible failures here.
  if (resolved.limits.agencyTenants <= 0) {
    return {
      ok: false,
      error: "Client workspaces come with the Agency plan. Pick it first, then add as many as you need.",
    };
  }
  if (resolved.parked) {
    return { ok: false, error: "This workspace is paused. Restart your plan first." };
  }
  if (resolved.trialing) {
    return {
      ok: false,
      error: "While you are on the trial you have one client workspace to try. Pick the Agency plan to add more.",
    };
  }

  const keyId = await platformKeyId();
  if (!keyId) return { ok: false, error: "Payments are not configured. Add Razorpay keys in Settings first." };

  const sub = await prisma.subscription.findUnique({
    where: { tenantId: scope.tenantId },
    select: { razorpaySlotSubscriptionId: true, extraAgencyTenants: true, status: true },
  });
  if (!sub) {
    return { ok: false, error: "There is no subscription on this workspace yet. Pick a plan first." };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { id: true, name: true, razorpayCustomerId: true },
  });
  if (!tenant) return { ok: false, error: "Workspace not found." };

  try {
    /**
     * 🔴 A STORED SLOT SUBSCRIPTION ID IS NOT PROOF OF PAYMENT, and reading it as such
     * gives away free workspaces. The id is written when Checkout OPENS, so an
     * abandoned purchase leaves it set with extraAgencyTenants still 0 - and the
     * quantity path below would then "add one more" to an unpaid subscription and raise
     * the cap on the spot. The paid count is the only evidence that there is a live slot
     * subscription to add to.
     *
     * So an id with no paid slots behind it is treated as abandoned: cancel it so
     * nothing can charge against it later, and start a fresh Checkout.
     */
    const live = sub.razorpaySlotSubscriptionId && sub.extraAgencyTenants > 0;
    if (!live) {
      if (sub.razorpaySlotSubscriptionId) {
        await cancelRazorpaySubscription(sub.razorpaySlotSubscriptionId).catch(() => {});
      }
      const { subscriptionId, shortUrl } = await createSlotSubscription(
        { id: tenant.id, name: tenant.name, razorpayCustomerId: tenant.razorpayCustomerId, ownerEmail: scope.email },
        1,
      );
      return { ok: true, data: { kind: "checkout", subscriptionId, keyId, shortUrl, quantity: 1 } };
    }
    const quantity = sub.extraAgencyTenants + 1;
    await updateSlotQuantity(sub.razorpaySlotSubscriptionId as string, quantity, "now");
    await setPaidSlots(scope.tenantId, quantity);
    revalidatePath("/w/agency-tenants");
    revalidatePath("/w/billing");
    return { ok: true, data: { kind: "added", quantity } };
  } catch (e) {
    console.error("[slots] add failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: e instanceof Error ? e.message : "Could not add a workspace. Please try again." };
  }
}

/**
 * Give one slot back.
 *
 * 🔴 Never below the number of live client workspaces. Allowing it would leave the agency
 * paying for fewer workspaces than they are running, with the cap refusing a create they
 * did not ask to lose - so the refusal names the workspace count instead.
 *
 * The reduction takes effect at the END of the billing period, because they have paid for
 * it: the count here is left alone and follows the next charged event, which is also why
 * nothing in the app has to remember a scheduled date.
 */
export async function removeAgencyTenantSlot(): Promise<ActionResult<{ quantity: number }>> {
  const scope = await agencyBillingScope();
  if (!scope.ok) return { ok: false, error: scope.error };

  const [sub, usage] = await Promise.all([
    prisma.subscription.findUnique({
      where: { tenantId: scope.tenantId },
      select: { razorpaySlotSubscriptionId: true, extraAgencyTenants: true },
    }),
    agencyTenantUsage(scope.tenantId),
  ]);
  if (!sub?.razorpaySlotSubscriptionId || sub.extraAgencyTenants <= 0) {
    return { ok: false, error: "You have no added workspaces to give back." };
  }
  const quantity = sub.extraAgencyTenants - 1;
  if (usage.used > usage.included + quantity) {
    return {
      ok: false,
      error: `You are running ${usage.used} client workspaces and would be left with ${usage.included + quantity}. Remove a workspace first.`,
    };
  }
  try {
    await updateSlotQuantity(sub.razorpaySlotSubscriptionId, quantity, "cycle_end");
  } catch (e) {
    console.error("[slots] remove failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Could not change your workspaces. Please try again." };
  }
  revalidatePath("/w/agency-tenants");
  revalidatePath("/w/billing");
  return { ok: true, data: { quantity } };
}

export interface VerifySlotInput {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

/**
 * Verify the first slot payment the moment Checkout succeeds, so the workspace can be
 * created in the next click rather than after the webhook. Razorpay signs subscription
 * payments as HMAC_SHA256(payment_id + "|" + subscription_id, key_secret).
 *
 * The webhook still owns the number on every renewal; this only fast-paths the first one.
 */
export async function verifySlotPayment(input: VerifySlotInput): Promise<ActionResult<{ quantity: number }>> {
  const scope = await agencyBillingScope();
  if (!scope.ok) return { ok: false, error: scope.error };
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

  // The slot subscription must be the one we created for THIS workspace.
  const sub = await prisma.subscription.findUnique({
    where: { tenantId: scope.tenantId },
    select: { razorpaySlotSubscriptionId: true, extraAgencyTenants: true },
  });
  if (sub?.razorpaySlotSubscriptionId !== input.razorpay_subscription_id) {
    return { ok: false, error: "That payment does not belong to this workspace." };
  }
  // Idempotent: the webhook may have landed first, and a second verify must not add a
  // second slot for one payment.
  const quantity = Math.max(1, sub?.extraAgencyTenants ?? 0);
  await setPaidSlots(scope.tenantId, quantity);
  revalidatePath("/w/agency-tenants");
  revalidatePath("/w/billing");
  return { ok: true, data: { quantity } };
}

/** The price shown next to the button, so the number has one source. */
export async function agencyTenantExtraPrice(): Promise<number> {
  return AGENCY_TENANT_EXTRA_USD;
}
