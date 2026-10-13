"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createOrder, isRazorpayConfigured } from "@/lib/payments/razorpay";
import { resolveRazorpayAccount, resolvePaymentLinkDescription, asRazorpayAccount } from "@/lib/settings/config";
import { paymentsAllowed } from "@/lib/payments/enabled";
import { payBaseUrl } from "@/features/payments/settle";
import { PAY_MAX_PAISE, type PayOrderResult } from "@/features/payments/links-shared";

/**
 * The PUBLIC half of a payment link: the client has opened /pay/<token>, typed an
 * amount, and pressed pay. This creates the Razorpay Order for THAT amount and hands
 * back the Checkout config.
 *
 * 🔴 Public and unauthenticated, so everything is re-checked here and nothing is
 * trusted from the browser:
 *   - the token must name a link that is still CREATED (a paid link is spent, a
 *     cancelled one is withdrawn);
 *   - the amount is checked against the link's OWN floor and the system ceiling,
 *     because the client sets it;
 *   - the order is signed with the account the link was generated on, which is the
 *     only account whose keys can later verify the payment;
 *   - the owner's payment switches are honoured, so a workspace that has been
 *     switched off cannot take money through an old link.
 */

const Input = z.object({
  token: z.string().min(10).max(200),
  /** Rupees, as typed on the page. */
  amount: z.number().finite().positive().max(PAY_MAX_PAISE / 100),
});

export async function createPayOrder(raw: unknown): Promise<PayOrderResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter a valid amount." };
  const { token, amount } = parsed.data;

  const link = await prisma.paymentLink.findUnique({
    where: { token },
    select: {
      id: true,
      tenantId: true,
      submissionId: true,
      account: true,
      minPaise: true,
      status: true,
      description: true,
    },
  });
  if (!link) return { ok: false, error: "This payment link is not valid." };
  if (link.status === "PAID") return { ok: false, error: "This link has already been paid." };
  if (link.status !== "CREATED") return { ok: false, error: "This payment link is no longer active." };

  const amountPaise = Math.round(amount * 100);
  if (amountPaise < link.minPaise) {
    return { ok: false, error: `The minimum for this link is ₹${(link.minPaise / 100).toLocaleString("en-IN")}.` };
  }
  if (amountPaise > PAY_MAX_PAISE) return { ok: false, error: "That amount is too large." };

  if (!(await paymentsAllowed(link.tenantId))) {
    return { ok: false, error: "This payment link is not accepting payments right now." };
  }

  const account = asRazorpayAccount(link.account);
  const keys = await resolveRazorpayAccount(link.tenantId, account);
  if (!isRazorpayConfigured(keys) || !keys.keyId) {
    return { ok: false, error: "This payment link is not set up to take payments. Please contact the sender." };
  }

  // Lead details for the Checkout prefill, and the tenant's name for the heading the
  // client reads above the payment methods - their vendor's name, not ours.
  const [sub, tenant, standingDescription] = await Promise.all([
    prisma.submission.findUnique({
      where: { id: link.submissionId },
      select: {
        leadFirstName: true,
        leadLastName: true,
        leadEmail: true,
        leadMobile: true,
        assessment: { select: { title: true } },
      },
    }),
    link.tenantId
      ? prisma.tenant.findUnique({ where: { id: link.tenantId }, select: { name: true } })
      : Promise.resolve(null),
    resolvePaymentLinkDescription(link.tenantId),
  ]);

  let order;
  try {
    order = await createOrder(
      {
        amountPaise,
        currency: "INR",
        // These notes are the binding. The verify route and the webhook both read
        // paymentLinkId back off the ORDER, so a valid signed payment cannot be
        // replayed against a different link.
        notes: {
          paymentLinkId: link.id,
          submissionId: link.submissionId,
          purpose: "product_sale",
          account,
        },
      },
      keys,
    );
  } catch (e) {
    console.error("[pay-link] order create failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Could not start the payment. Please try again." };
  }

  // Remember the latest attempt, for reconciliation when a payment goes missing.
  await prisma.paymentLink.update({ where: { id: link.id }, data: { providerOrderId: order.id } }).catch(() => {});

  const base = await payBaseUrl(link.tenantId);
  const name = [sub?.leadFirstName, sub?.leadLastName].filter(Boolean).join(" ") || null;
  const description =
    link.description?.trim() ||
    standingDescription ||
    (sub?.assessment?.title ? `Payment - ${sub.assessment.title}` : "Payment");

  return {
    ok: true,
    checkout: {
      keyId: keys.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      name: tenant?.name?.trim() || "Assess360",
      description,
      prefill: { name, email: sub?.leadEmail ?? null, contact: sub?.leadMobile ?? null },
      callbackUrl: `${base}/api/pay/link/verify?token=${encodeURIComponent(token)}`,
      notes: { paymentLinkId: link.id, submissionId: link.submissionId },
    },
  };
}
