import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { verifyPaymentSignature } from "@/lib/payments/razorpay";
import { recordCapture } from "@/lib/meta/capi-log";
import { emitCompletedPaid } from "@/lib/events/completion";

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
      attribution: true,
      createdAt: true,
      assessment: { select: { slug: true, targetUrl: true, paymentAmount: true, paymentEventName: true } },
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

  // CRM "completed_paid" event (once) — the paid pipeline.
  await emitCompletedPaid(submissionId);

  const dest = vslUrl(s.assessment.targetUrl, s.assessment.slug, submissionId, s.resultToken);
  const finalUrl = dest + (dest.includes("?") ? "&" : "?") + "event=1";

  // Server-side Purchase (CAPI) via the unified log — deduped by the Razorpay
  // payment id and fired per the auto-fire amount rules (same path as the webhook,
  // so an in-app payment can't double-fire under two event names). Fire-and-forget;
  // never blocks the redirect.
  void recordCapture({
    providerPaymentId: paymentId,
    email: s.leadEmail,
    phone: s.leadMobile,
    amountPaise: amountRupees != null ? amountRupees * 100 : null,
    currency: "INR",
    submissionId,
  }).catch(() => {});

  return NextResponse.redirect(finalUrl, 303);
}
