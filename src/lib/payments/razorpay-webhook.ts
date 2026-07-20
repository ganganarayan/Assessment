import "server-only";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { verifyWebhookSignature, isWebhookSignatureVerified } from "@/lib/payments/razorpay";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { recordCapture } from "@/lib/meta/capi-log";
import { emitCompletedPaid } from "@/lib/events/completion";

/**
 * Shared Razorpay webhook handler, parameterized by TENANT.
 *
 * The tenant is decided by the URL that Razorpay was configured to call:
 *   - POST /api/payments/razorpay          → tenantId = null (platform/Gita; env fallback)
 *   - POST /api/payments/razorpay/[tenant] → that tenant (its OWN webhook secret)
 *
 * The HMAC is verified with THAT tenant's webhook secret (resolveRazorpayConfig),
 * so each Razorpay account signs against its own endpoint. On every SIGNED, CAPTURED
 * payment it records a CAPI log row (recordCapture — stamped with the webhook's
 * tenant so the Meta Purchase fires on the tenant's pixel/CAPI) and, for IN-APP
 * payments (order carried our submissionId), records the Payment + fires
 * completed_paid for the CRM. Deduped by the Razorpay payment id on both sides.
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

  const { webhookSecret } = await resolveRazorpayConfig(tenantId);
  if (!verifyWebhookSignature(raw, signature, webhookSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const verified = isWebhookSignatureVerified(raw, signature, webhookSecret);

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

  // A settled one-time payment is "captured" (order/checkout) or "paid" (payment link).
  // Store the CANONICAL "captured" so consumers that filter on "captured" alone don't
  // miss link sales — a "paid" row would otherwise vanish from revenue AND get the
  // unpaid-dunning nudge fired at a paying customer.
  const settled = rawStatus === "captured" || rawStatus === "paid";
  const status = "captured";

  if (!verified || !settled) {
    return NextResponse.json({ ok: true, ignored: "unverified or not settled" });
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

  // 2) IN-APP sale bookkeeping: the Razorpay order carried our submissionId, so
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
            event,
            notes: notes as Prisma.InputJsonValue,
            tenantId: sub.tenantId,
            assessmentId: sub.assessmentId,
          },
        });
      } catch {
        // Payment row already exists (Razorpay retry / verify path) — dedup on the
        // unique providerPaymentId.
      }
      // Fire completed_paid regardless of who inserted the Payment row — its own
      // completedPaidAt CAS makes it exactly-once, so a create collision (verify
      // already recorded the sale) can never SKIP the CRM paid event.
      if (purpose === "assessment_unlock") void emitCompletedPaid(submissionId).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
