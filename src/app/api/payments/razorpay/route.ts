import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { verifyWebhookSignature, isWebhookSignatureVerified } from "@/lib/payments/razorpay";
import { sendCapiEventVerbose, isCapiConfigured } from "@/lib/meta/send";
import { buildPurchaseUserData, PURCHASE_EVENT_NAME } from "@/lib/meta/purchase";
import { emitCompletedPaid } from "@/lib/events/completion";

/** The submission fields a fully-attributed Purchase needs (shared select). */
const PURCHASE_SELECT = {
  resultToken: true,
  leadFirstName: true,
  leadLastName: true,
  leadEmail: true,
  leadMobile: true,
  attribution: true,
  fbc: true,
  fbp: true,
  clientIp: true,
  userAgent: true,
  fbclidTimestamp: true,
  createdAt: true,
} as const;

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
    select: { ...PURCHASE_SELECT, assessment: { select: { slug: true, targetUrl: true, paymentAmount: true, paymentEventName: true } } },
  });
  if (!s?.assessment) return;
  const amountRupees = s.assessment.paymentAmount ?? (amountPaise != null ? amountPaise / 100 : null);
  const dest = vslUrl(s.assessment.targetUrl, s.assessment.slug, submissionId, s.resultToken);
  const r = await sendCapiEventVerbose({
    eventName: s.assessment.paymentEventName || "Purchase121",
    eventId: paymentId,
    eventTimeMs: Date.now(),
    eventSourceUrl: dest,
    // Full match signals (email/phone/name + fbc/fbp/ip/UA) — not just fbc.
    user: buildPurchaseUserData(s),
    customData: amountRupees != null ? { value: amountRupees, currency: "INR" } : { currency: "INR" },
  });
  if (r.ok) {
    await prisma.payment
      .updateMany({ where: { providerPaymentId: paymentId, metaConversionAt: null }, data: { metaConversionAt: new Date() } })
      .catch(() => {});
  }
}

/**
 * EXTERNAL payment (no app submissionId in the Razorpay notes) matched to a
 * contact by email — fire the standard `Purchase` with full attribution. Kept
 * SEPARATE from the in-app path: no completed_paid, no assessment_unlock row, so
 * it never triggers the /api/r browser-purchase pixel (which uses a different
 * event name) and can't cause a name-mismatch double-count. Deduped by payment id.
 */
async function fireExternalPurchaseCapi(submissionId: string, paymentId: string, amountPaise: number | null) {
  if (!isCapiConfigured()) return;
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { ...PURCHASE_SELECT, assessment: { select: { slug: true, targetUrl: true, paymentAmount: true } } },
  });
  if (!s?.assessment) return;
  const amountRupees = s.assessment.paymentAmount ?? (amountPaise != null ? amountPaise / 100 : null);
  const dest = vslUrl(s.assessment.targetUrl, s.assessment.slug, submissionId, s.resultToken);
  const r = await sendCapiEventVerbose({
    eventName: PURCHASE_EVENT_NAME,
    eventId: paymentId,
    eventTimeMs: Date.now(),
    eventSourceUrl: dest,
    user: buildPurchaseUserData(s),
    customData: amountRupees != null ? { value: amountRupees, currency: "INR" } : { currency: "INR" },
  });
  if (r.ok) {
    await prisma.payment
      .updateMany({ where: { providerPaymentId: paymentId, metaConversionAt: null }, data: { metaConversionAt: new Date() } })
      .catch(() => {});
  }
}

/**
 * Match an external capture to a contact by email, GUARDED by amount == the
 * assessment's configured price. Returns the submission id only when both the
 * email matches a completed submission AND the captured paise equals price×100 —
 * so unrelated charges (₹5000 etc.) on the same Razorpay account never fire.
 */
async function matchExternalPayment(email: string | null, amountPaise: number | null): Promise<string | null> {
  if (!email || amountPaise == null) return null;
  const norm = email.trim().toLowerCase();
  if (!norm) return null;
  const sub = await prisma.submission.findFirst({
    where: { status: "COMPLETED", leadEmail: { equals: norm, mode: "insensitive" } },
    orderBy: { completedAt: "desc" },
    select: { id: true, assessment: { select: { paymentAmount: true } } },
  });
  const priceRupees = sub?.assessment?.paymentAmount ?? null;
  if (!sub || priceRupees == null || priceRupees * 100 !== amountPaise) return null;
  return sub.id;
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

  const status = asStr(payment.status) ?? "captured";
  const amount = asInt(payment.amount);
  const submissionId = asStr(notes.submissionId);

  // EXTERNAL payment: no app submissionId (payment taken on the customer's own
  // page). Match the buyer by email, GUARDED by amount == the assessment price, and
  // fire the standard `Purchase` CAPI with full attribution. Recorded under a
  // distinct purpose (external_purchase) purely for retry-dedup — it does NOT count
  // as an in-app sale or trigger the /api/r purchase pixel. Unrelated charges (no
  // matching email, or a different amount) are ignored, same as before.
  if (!submissionId) {
    if (!verified || status !== "captured") {
      return NextResponse.json({ ok: true, ignored: "external: unverified or not captured" });
    }
    const matched = await matchExternalPayment(asStr(payment.email), amount);
    if (!matched) {
      return NextResponse.json({ ok: true, ignored: "external: no price-matching email submission" });
    }
    try {
      await prisma.payment.create({
        data: {
          provider: "razorpay",
          providerPaymentId,
          providerOrderId: asStr(payment.order_id),
          purpose: "external_purchase",
          submissionId: matched,
          amount,
          currency: asStr(payment.currency) ?? "INR",
          status,
          method: asStr(payment.method),
          event,
          notes: notes as Prisma.InputJsonValue,
        },
      });
    } catch {
      return NextResponse.json({ ok: true, duplicate: true }); // lost a race
    }
    void fireExternalPurchaseCapi(matched, providerPaymentId, amount).catch(() => {});
    return NextResponse.json({ ok: true, external: true });
  }

  // IN-APP payment: the Razorpay order carried our submissionId.
  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, select: { id: true } });
  if (!sub) {
    return NextResponse.json({ ok: true, ignored: "unknown submissionId — not an assessment payment" });
  }
  const purpose = asStr(notes.purpose) ?? "assessment_unlock";

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
  // submissionId is guaranteed valid above. Fire-and-forget so the webhook responds
  // fast (the persistent server keeps the promise alive).
  if (created && verified && purpose === "assessment_unlock" && status === "captured") {
    void fireConversionFromWebhook(submissionId, providerPaymentId, amount).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
