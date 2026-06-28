import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { verifyWebhookSignature, isWebhookSignatureVerified } from "@/lib/payments/razorpay";
import { sendCapiEvent, isCapiConfigured } from "@/lib/meta/send";
import { emitCompletedPaid } from "@/lib/events/completion";

export const dynamic = "force-dynamic";

function vslUrl(targetUrl: string | null, slug: string, submissionId: string, token: string | null): string {
  if (targetUrl && token) {
    try {
      const u = new URL(targetUrl);
      u.searchParams.set("t", token);
      return u.toString();
    } catch {
      /* fall through */
    }
  }
  return `${env.NEXT_PUBLIC_APP_URL}/a/${slug}/r/${submissionId}`;
}

/**
 * Fire the Meta conversion (Purchase121) + the completed_paid CRM event for a
 * payment recorded by THIS webhook — the case where the buyer never returned to
 * the browser (mobile UPI app-switch, closed tab), so /api/payments/verify never
 * ran and nothing told Meta. Deduped by the Razorpay payment id (same event_id as
 * the redirect path) so a returning buyer is never double-counted; emitCompletedPaid
 * is CAS-guarded so completed_paid can't fire twice. No browser context here
 * (server-to-server), so match quality rides on the hashed email/phone/name.
 */
async function fireConversionFromWebhook(submissionId: string, paymentId: string, amountPaise: number | null) {
  await emitCompletedPaid(submissionId).catch(() => {});
  if (!isCapiConfigured()) return;
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      assessment: { select: { slug: true, targetUrl: true, paymentAmount: true, paymentEventName: true } },
    },
  });
  if (!s?.assessment) return;
  const amountRupees = s.assessment.paymentAmount ?? (amountPaise != null ? amountPaise / 100 : null);
  const dest = vslUrl(s.assessment.targetUrl, s.assessment.slug, submissionId, s.resultToken);
  await sendCapiEvent({
    eventName: s.assessment.paymentEventName || "Purchase121",
    eventId: paymentId,
    eventTimeMs: Date.now(),
    eventSourceUrl: dest,
    user: { email: s.leadEmail, phone: s.leadMobile, firstName: s.leadFirstName, lastName: s.leadLastName },
    customData: amountRupees != null ? { value: amountRupees, currency: "INR" } : { currency: "INR" },
  }).catch(() => {});
}

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
  const signature = req.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  // Fire conversions ONLY on a genuinely-signed webhook (secret set + valid sig),
  // so an unauthenticated POST can never inflate Meta conversions / pollute the CRM.
  const verified = isWebhookSignatureVerified(raw, signature);

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

  // Dedup: Razorpay retries webhooks; and /api/payments/verify may have recorded
  // it already (then IT fired the conversion) — so we only fire when WE create it.
  const existing = await prisma.payment.findUnique({ where: { providerPaymentId } });
  if (existing) return NextResponse.json({ ok: true, duplicate: true });

  const submissionId = asStr(notes.submissionId);
  const purpose = asStr(notes.purpose) ?? "assessment_unlock";
  const status = asStr(payment.status) ?? "captured";
  const amount = asInt(payment.amount);

  let created = false;
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
        currency: asStr(payment.currency) ?? "INR",
        status,
        method: asStr(payment.method),
        event,
        notes: notes as Prisma.InputJsonValue,
      },
    });
    created = true;
  } catch {
    created = false; // lost a race (verify/retry created it) — don't double-fire
  }

  // This webhook is the path of record for buyers who never returned to the
  // browser: fire the Meta conversion + completed_paid here (deduped/CAS-guarded).
  if (created && verified && purpose === "assessment_unlock" && status === "captured") {
    if (submissionId) {
      await fireConversionFromWebhook(submissionId, providerPaymentId, amount);
    } else {
      // Recorded but unlinkable — no submission to fire the conversion against.
      console.error(`[razorpay-webhook] captured payment ${providerPaymentId} has no submissionId in notes; conversion not fired.`);
    }
  }

  return NextResponse.json({ ok: true });
}
