import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook — POST /api/payments/razorpay (public; called by Razorpay).
 * HMAC-verified via RAZORPAY_WEBHOOK_SECRET. Records each successful one-time
 * payment (payment_link.paid / payment.captured) in the payment table, deduped by
 * the Razorpay payment id. Forward-compatible: subscription.* events (Starter/Pro
 * tiers) will be handled here later.
 *
 * Dashboard → Settings → Webhooks:
 *   URL: https://assess.applygitawisdom.com/api/payments/razorpay
 *   Events: payment_link.paid (+ later: subscription.charged, etc.)
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

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
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

  // Dedup: Razorpay retries webhooks.
  const existing = await prisma.payment.findUnique({ where: { providerPaymentId } });
  if (existing) return NextResponse.json({ ok: true, duplicate: true });

  await prisma.payment
    .create({
      data: {
        provider: "razorpay",
        providerPaymentId,
        providerOrderId: asStr(payment.order_id),
        providerLinkId: asStr(link.id) ?? asStr(payment.payment_link_id),
        purpose: asStr(notes.purpose) ?? "assessment_unlock",
        plan: asStr(notes.plan),
        submissionId: asStr(notes.submissionId),
        amount: asInt(payment.amount),
        currency: asStr(payment.currency) ?? "INR",
        status: asStr(payment.status) ?? "captured",
        method: asStr(payment.method),
        event,
        notes: notes as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
