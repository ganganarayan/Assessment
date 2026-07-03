"use server";

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { testCapi, sendCapiEventVerbose } from "@/lib/meta/send";
import { buildPurchaseUserData, PURCHASE_EVENT_NAME } from "@/lib/meta/purchase";

/** Super-admin diagnostic: fire a server-side CAPI event (any name, default
 *  AssessmentCompleted) to Meta and return Meta's real response. */
export async function testMetaCapi(testEventCode?: string, eventName?: string) {
  await requireSuperAdmin();
  return testCapi(testEventCode, eventName);
}

/**
 * Recovery: re-send the REAL purchase conversion for one paid submission to Meta
 * (e.g. a sale whose buyer never returned, so CAPI never fired). Uses the Razorpay
 * payment id as event_id (so it dedups against any later fire) and the payment's
 * own time (must be within Meta's 7-day window). Returns Meta's actual response.
 */
export async function resendPurchaseToMeta(submissionId: string, force = false): Promise<{
  ok: boolean;
  status?: number;
  response?: string;
  error?: string;
  eventName?: string;
  eventId?: string;
}> {
  await requireSuperAdmin();
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
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
      assessment: { select: { slug: true, targetUrl: true, paymentAmount: true, paymentEventName: true } },
    },
  });
  if (!s?.assessment) return { ok: false, error: "Submission or assessment not found." };

  const p = await prisma.payment.findFirst({
    where: { submissionId, purpose: "assessment_unlock", status: { in: ["captured", "paid"] }, providerPaymentId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { providerPaymentId: true, amount: true, currency: true, createdAt: true, metaConversionAt: true },
  });
  if (!p?.providerPaymentId) return { ok: false, error: "No captured payment found for this submission." };

  const eventName = s.assessment.paymentEventName || "Purchase121";
  // Backstop: don't re-send an already-confirmed conversion UNLESS forced (e.g. to
  // re-fire with the click id now attached). Meta dedups by event_id either way.
  if (p.metaConversionAt && !force) {
    return {
      ok: false,
      error: `Already sent to Meta on ${p.metaConversionAt.toISOString().slice(0, 16).replace("T", " ")} — no action needed.`,
      eventName,
      eventId: p.providerPaymentId,
    };
  }
  const amountRupees = s.assessment.paymentAmount ?? (p.amount != null ? p.amount / 100 : null);
  const base = s.assessment.targetUrl && s.resultToken
    ? (() => {
        try {
          const u = new URL(s.assessment.targetUrl);
          u.searchParams.set("t", s.resultToken);
          return u.toString();
        } catch {
          return `${env.NEXT_PUBLIC_APP_URL}/a/${s.assessment.slug}/r/${submissionId}`;
        }
      })()
    : `${env.NEXT_PUBLIC_APP_URL}/a/${s.assessment.slug}/r/${submissionId}`;
  const r = await sendCapiEventVerbose({
    eventName,
    eventId: p.providerPaymentId,
    eventTimeMs: p.createdAt.getTime(),
    eventSourceUrl: base,
    // Full match signals (email/phone/name + fbc/fbp/ip/UA).
    user: buildPurchaseUserData(s),
    customData: amountRupees != null ? { value: amountRupees, currency: p.currency || "INR" } : { currency: p.currency || "INR" },
  });
  if (r.ok) {
    await prisma.payment
      .updateMany({ where: { providerPaymentId: p.providerPaymentId, metaConversionAt: null }, data: { metaConversionAt: new Date() } })
      .catch(() => {});
  }
  return { ...r, eventName, eventId: p.providerPaymentId };
}

/**
 * Manual recovery for an EXTERNAL payment (no in-app Payment row): fire the
 * standard `Purchase` to Meta for a Razorpay payment id + buyer email. Pulls full
 * attribution from the most recent COMPLETED submission for that email (fbc/fbp/
 * ip/UA); if none matches it still fires on email+phone alone. event_id = the
 * payment id, so it dedups against the browser Purchase on the thank-you page.
 * Returns Meta's actual response. Fire ONCE per payment.
 */
export async function resendPurchaseByEmail(input: {
  paymentId: string;
  email: string;
  phone?: string;
  amountRupees: number;
}): Promise<{ ok: boolean; status?: number; response?: string; error?: string; matched: boolean; eventId: string }> {
  await requireSuperAdmin();
  const paymentId = input.paymentId.trim();
  const email = input.email.trim().toLowerCase();
  const phone = (input.phone ?? "").trim() || null;
  if (!paymentId || !email) return { ok: false, error: "payment_id and email are required.", matched: false, eventId: paymentId };

  const s = await prisma.submission.findFirst({
    where: { status: "COMPLETED", leadEmail: { equals: email, mode: "insensitive" } },
    orderBy: { completedAt: "desc" },
    select: {
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
      assessment: { select: { targetUrl: true } },
    },
  });

  const user = s
    ? buildPurchaseUserData(s)
    : { email, phone };

  const r = await sendCapiEventVerbose({
    eventName: PURCHASE_EVENT_NAME,
    eventId: paymentId,
    eventTimeMs: Date.now(),
    eventSourceUrl: s?.assessment?.targetUrl ?? env.NEXT_PUBLIC_APP_URL,
    user,
    customData: { value: input.amountRupees, currency: "INR" },
  });
  return { ...r, matched: !!s, eventId: paymentId };
}
