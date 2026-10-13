import "server-only";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isWebhookSignatureVerified } from "@/lib/payments/razorpay";
import { resolveRazorpayAccounts, type RazorpayAccountKind } from "@/lib/settings/config";
import { recordCapture } from "@/lib/meta/capi-log";
import { emitCompletedPaid } from "@/lib/events/completion";
import { settlePaymentLink } from "@/features/payments/settle";

/**
 * Shared Razorpay webhook handler, parameterized by TENANT.
 *
 * The tenant is decided by the URL that Razorpay was configured to call:
 *   - POST /api/payments/razorpay          → tenantId = null (platform/Gita; env fallback)
 *   - POST /api/payments/razorpay/[tenant] → that tenant (its OWN webhook secret)
 *
 * The HMAC is verified with that tenant's webhook secret - EITHER of them. A tenant
 * may run two Razorpay accounts (GST and non-GST) and Razorpay points both dashboards
 * at this same URL, so the signature is checked against each configured secret and the
 * one that matches names the account that took the money. Neither matching is still a
 * rejection: fail-closed is the whole point of a public money endpoint.
 *
 * On every SIGNED, CAPTURED payment it records a CAPI log row (recordCapture -
 * stamped with the webhook's tenant so the Meta Purchase fires on the tenant's
 * pixel/CAPI). Then, for a HAND-SENT payment link (the order named one), it books the
 * product sale; and for an IN-APP funnel payment (the order carried our submissionId),
 * it records the Payment + fires completed_paid for the CRM. Deduped by the Razorpay
 * payment id on every side.
 */

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const asStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asInt = (v: unknown): number | null => {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
};

const HANDLED = ["payment_link.paid", "payment.captured"];

export async function handleRazorpayWebhook(req: Request, tenantId: string | null): Promise<NextResponse> {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  // Which of this tenant's accounts signed this? Try each CONFIGURED secret; an
  // account with no secret stored cannot match (isWebhookSignatureVerified requires
  // one), so an unconfigured second account adds no new way in.
  const accounts = await resolveRazorpayAccounts(tenantId);
  let signedBy: RazorpayAccountKind | null = null;
  for (const a of accounts) {
    if (isWebhookSignatureVerified(raw, signature, a.config.webhookSecret)) {
      signedBy = a.account;
      break;
    }
  }
  if (!signedBy) {
    console.error("[razorpay] webhook rejected: signature matched no configured account secret");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = asObj(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const event = asStr(body.event);
  if (!event || !HANDLED.includes(event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const payload = asObj(body.payload);
  const payment = asObj(asObj(payload.payment).entity);
  const link = asObj(asObj(payload.payment_link).entity);
  const notes = { ...asObj(link.notes), ...asObj(payment.notes) };

  const providerPaymentId = asStr(payment.id);
  if (!providerPaymentId) return NextResponse.json({ ok: true, warning: "no payment id" });

  const rawStatus = asStr(payment.status) ?? "captured";
  const amount = asInt(payment.amount);
  const currency = asStr(payment.currency) ?? "INR";
  const submissionId = asStr(notes.submissionId);
  // Set on an order created by /pay/<token>: a hand-sent payment link for the FINAL
  // product, not the funnel's consultation unlock.
  const paymentLinkId = asStr(notes.paymentLinkId);

  // ISOLATION: an Assess360 SaaS subscription charge (USD) also emits payment.captured
  // and carries an invoice_id. That is NOT a Gita funnel purchase - it must never enter
  // this INR Purchase-CAPI pipeline (it would pollute the Gita Purchase audience). The
  // subscription lifecycle is handled entirely by /api/billing/razorpay. Skip it here.
  if (asStr(payment.invoice_id)) {
    return NextResponse.json({ ok: true, ignored: "subscription/invoice payment" });
  }

  // A settled one-time payment is "captured" (order/checkout) or "paid" (payment link).
  // Store the CANONICAL "captured" so consumers that filter on "captured" alone don't
  // miss link sales - a "paid" row would otherwise vanish from revenue AND get the
  // unpaid-dunning nudge fired at a paying customer.
  const settled = rawStatus === "captured" || rawStatus === "paid";
  const status = "captured";

  // Signed (checked above) but not settled - an authorized-not-captured payment, say.
  // Nothing is recorded until money has actually moved.
  if (!settled) {
    return NextResponse.json({ ok: true, ignored: "not settled" });
  }

  // 1) Record EVERY captured payment in the CAPI log; auto-fire per the amount rules
  //    (deduped by payment id). Stamp the webhook's tenant so external payments (no
  //    submission match) still fire on the RIGHT tenant's pixel/CAPI. Fire-and-forget.
  void recordCapture({
    providerPaymentId,
    email: asStr(payment.email),
    phone: asStr(payment.contact),
    amountPaise: amount,
    currency,
    submissionId, // null for external payments (matched by email inside)
    tenantId,
  }).catch(() => {});

  // 2) PAYMENT-LINK sale: the order named one of our links. Settled in one place
  //    shared with the browser's return path, so whichever arrives first books the
  //    sale and the other is a no-op. This path never fires completed_paid - the
  //    product sale is not the funnel's consultation unlock, and counting it as one
  //    would flatter the funnel's conversion rate with money it did not earn.
  if (paymentLinkId) {
    const link = await prisma.paymentLink.findUnique({
      where: { id: paymentLinkId },
      select: { id: true, tenantId: true, submissionId: true, assessmentId: true, account: true },
    });
    if (link) {
      await settlePaymentLink({
        link,
        providerPaymentId,
        providerOrderId: asStr(payment.order_id),
        amountPaise: amount,
        currency,
        event,
        customer: { email: asStr(payment.email), phone: asStr(payment.contact) },
      });
    } else {
      console.error("[razorpay] webhook: order named an unknown payment link", paymentLinkId);
    }
    return NextResponse.json({ ok: true, settled: "payment_link" });
  }

  // 3) IN-APP sale bookkeeping: the Razorpay order carried our submissionId, so
  //    record the Payment + fire completed_paid for the CRM. CAPI is handled above.
  if (submissionId) {
    const sub = await prisma.submission.findUnique({ where: { id: submissionId }, select: { id: true, tenantId: true, assessmentId: true } });
    if (sub) {
      const purpose = asStr(notes.purpose) ?? "assessment_unlock";
      try {
        await prisma.payment.create({
          data: {
            provider: "razorpay",
            providerPaymentId,
            providerOrderId: asStr(payment.order_id),
            providerLinkId: asStr(link.id) ?? asStr(payment.payment_link_id),
            purpose,
            plan: asStr(notes.plan),
            submissionId,
            amount,
            currency,
            status,
            method: asStr(payment.method),
            providerAccount: signedBy,
            event,
            notes: notes as Prisma.InputJsonValue,
            tenantId: sub.tenantId,
            assessmentId: sub.assessmentId,
          },
        });
      } catch {
        // Payment row already exists (Razorpay retry / verify path) - dedup on the
        // unique providerPaymentId.
      }
      // Fire completed_paid regardless of who inserted the Payment row - its own
      // completedPaidAt CAS makes it exactly-once, so a create collision (verify
      // already recorded the sale) can never SKIP the CRM paid event.
      if (purpose === "assessment_unlock") void emitCompletedPaid(submissionId).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
