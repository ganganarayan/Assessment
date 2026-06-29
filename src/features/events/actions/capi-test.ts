"use server";

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { testCapi, sendCapiEventVerbose } from "@/lib/meta/send";
import { fbcFromFbclid } from "@/lib/meta/capi";

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
  // Ad-click id from the captured fbclid — the signal Meta needs to ATTRIBUTE this.
  const fbclid = (s.attribution as { fbclid?: string } | null)?.fbclid ?? null;
  const fbc = fbcFromFbclid(fbclid, s.createdAt.getTime());

  const r = await sendCapiEventVerbose({
    eventName,
    eventId: p.providerPaymentId,
    eventTimeMs: p.createdAt.getTime(),
    eventSourceUrl: base,
    user: { email: s.leadEmail, phone: s.leadMobile, firstName: s.leadFirstName, lastName: s.leadLastName, fbc },
    customData: amountRupees != null ? { value: amountRupees, currency: p.currency || "INR" } : { currency: p.currency || "INR" },
  });
  if (r.ok) {
    await prisma.payment
      .updateMany({ where: { providerPaymentId: p.providerPaymentId, metaConversionAt: null }, data: { metaConversionAt: new Date() } })
      .catch(() => {});
  }
  return { ...r, eventName, eventId: p.providerPaymentId };
}
