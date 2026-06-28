"use server";

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { testCapi, sendCapiEventVerbose } from "@/lib/meta/send";

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
export async function resendPurchaseToMeta(submissionId: string): Promise<{
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
      assessment: { select: { slug: true, targetUrl: true, paymentAmount: true, paymentEventName: true } },
    },
  });
  if (!s?.assessment) return { ok: false, error: "Submission or assessment not found." };

  const p = await prisma.payment.findFirst({
    where: { submissionId, purpose: "assessment_unlock", status: { in: ["captured", "paid"] }, providerPaymentId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { providerPaymentId: true, amount: true, currency: true, createdAt: true },
  });
  if (!p?.providerPaymentId) return { ok: false, error: "No captured payment found for this submission." };

  const eventName = s.assessment.paymentEventName || "Purchase121";
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
    user: { email: s.leadEmail, phone: s.leadMobile, firstName: s.leadFirstName, lastName: s.leadLastName },
    customData: amountRupees != null ? { value: amountRupees, currency: p.currency || "INR" } : { currency: p.currency || "INR" },
  });
  return { ...r, eventName, eventId: p.providerPaymentId };
}
