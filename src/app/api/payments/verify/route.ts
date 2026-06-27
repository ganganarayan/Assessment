import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { verifyPaymentSignature } from "@/lib/payments/razorpay";
import { sendCapiEvent, isCapiConfigured } from "@/lib/meta/send";
import { getMetaRequestContext } from "@/lib/meta/request-context";

export const dynamic = "force-dynamic";

/**
 * Razorpay Checkout (redirect:true) POSTs here after a successful payment. We
 * verify the signature, then 302 the customer to the destination/VSL with the
 * result token — the token is only revealed after a verified payment, so the
 * results can't be reached for free. The submission id rides in ?submission=.
 */

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

export async function POST(req: Request) {
  const url = new URL(req.url);
  const submissionId = url.searchParams.get("submission");
  const failed = NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/?payment=failed`, 303);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return failed;
  }
  const paymentId = String(form.get("razorpay_payment_id") ?? "");
  const orderId = String(form.get("razorpay_order_id") ?? "");
  const signature = String(form.get("razorpay_signature") ?? "");

  if (!submissionId || !verifyPaymentSignature(orderId, paymentId, signature)) {
    return failed;
  }

  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      assessment: { select: { slug: true, targetUrl: true, paymentAmount: true } },
    },
  });
  if (!s || !s.assessment) return failed;

  const amountRupees = s.assessment.paymentAmount ?? null;

  // Record the payment (authoritative — has the submission link). Dedup/idempotent.
  await prisma.payment
    .upsert({
      where: { providerPaymentId: paymentId },
      create: {
        provider: "razorpay",
        providerPaymentId: paymentId,
        providerOrderId: orderId,
        purpose: "assessment_unlock",
        submissionId,
        amount: amountRupees != null ? amountRupees * 100 : null,
        currency: "INR",
        status: "captured",
        event: "checkout.verified",
        notes: { submissionId } as Prisma.InputJsonValue,
      },
      update: { submissionId, providerOrderId: orderId, status: "captured", amount: amountRupees != null ? amountRupees * 100 : undefined },
    })
    .catch(() => {});

  const dest = vslUrl(s.assessment.targetUrl, s.assessment.slug, submissionId, s.resultToken);
  const finalUrl = dest + (dest.includes("?") ? "&" : "?") + "event=1";

  // Server-side Purchase (CAPI), deduped against the browser pixel via the SAME
  // event_id (the Razorpay payment id). Fires on every verified payment; the
  // verify POST carries the buyer's cookies/IP/UA, so match quality is strong.
  if (isCapiConfigured()) {
    const ctx = await getMetaRequestContext();
    void sendCapiEvent({
      eventName: "Purchase",
      eventId: paymentId,
      eventTimeMs: Date.now(),
      eventSourceUrl: dest,
      user: { email: s.leadEmail, phone: s.leadMobile, firstName: s.leadFirstName, lastName: s.leadLastName, ...ctx },
      customData: amountRupees != null ? { value: amountRupees, currency: "INR" } : { currency: "INR" },
    }).catch(() => {});
  }

  return NextResponse.redirect(finalUrl, 303);
}
