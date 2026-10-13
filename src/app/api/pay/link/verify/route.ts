import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyPaymentSignature, fetchOrder } from "@/lib/payments/razorpay";
import { resolveRazorpayAccount, asRazorpayAccount } from "@/lib/settings/config";
import { settlePaymentLink, payBaseUrl } from "@/features/payments/settle";

export const dynamic = "force-dynamic";

/**
 * Razorpay Checkout (redirect: true) POSTs here after a payment made on /pay/<token>.
 *
 * What this route is for is BOOKKEEPING SPEED, not authorisation: the webhook books
 * the same sale on its own, but it can arrive seconds or minutes later, and the person
 * who just paid is looking at a redirect right now. So we verify, record, and send
 * them to the paid page. Both paths are idempotent (see settlePaymentLink).
 *
 * The security is the same shape as the funnel's verify route:
 *   - the signature is checked with the keys of the account THIS LINK was generated on;
 *   - the order's OWN notes must name this link, so a valid signed payment cannot be
 *     replayed against a different link;
 *   - a failure never books anything and never flips the link.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  // Where to send them when we cannot confirm. ?paid=0 makes the page say "nothing was
  // charged, try again" instead of leaving them on a blank failure.
  const backTo = async (tenantId: string | null, ok: boolean) => {
    const base = await payBaseUrl(tenantId);
    return token
      ? `${base}/pay/${encodeURIComponent(token)}?paid=${ok ? "1" : "0"}`
      : `${base}/?payment=${ok ? "ok" : "failed"}`;
  };

  if (!token) return NextResponse.redirect(await backTo(null, false), 303);

  const link = await prisma.paymentLink.findUnique({
    where: { token },
    select: {
      id: true,
      tenantId: true,
      submissionId: true,
      assessmentId: true,
      account: true,
      status: true,
    },
  });
  if (!link) return NextResponse.redirect(await backTo(null, false), 303);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.redirect(await backTo(link.tenantId, false), 303);
  }
  const paymentId = String(form.get("razorpay_payment_id") ?? "");
  const orderId = String(form.get("razorpay_order_id") ?? "");
  const signature = String(form.get("razorpay_signature") ?? "");

  const account = asRazorpayAccount(link.account);
  const keys = await resolveRazorpayAccount(link.tenantId, account);
  if (!verifyPaymentSignature(orderId, paymentId, signature, keys.keySecret)) {
    return NextResponse.redirect(await backTo(link.tenantId, false), 303);
  }

  // Bind to the order's own notes - the amount comes from the order too, so what gets
  // recorded is what Razorpay actually charged, never a number from the browser.
  let order;
  try {
    order = await fetchOrder(orderId, keys);
  } catch {
    return NextResponse.redirect(await backTo(link.tenantId, false), 303);
  }
  if (order.notes?.paymentLinkId !== link.id) {
    console.error("[pay-link] verify rejected: order notes do not name this link");
    return NextResponse.redirect(await backTo(link.tenantId, false), 303);
  }

  const sub = await prisma.submission.findUnique({
    where: { id: link.submissionId },
    select: { leadEmail: true, leadMobile: true },
  });

  await settlePaymentLink({
    link: {
      id: link.id,
      tenantId: link.tenantId,
      submissionId: link.submissionId,
      assessmentId: link.assessmentId,
      account,
    },
    providerPaymentId: paymentId,
    providerOrderId: orderId,
    amountPaise: order.amount ?? null,
    currency: order.currency ?? "INR",
    event: "pay_link.verified",
    customer: { email: sub?.leadEmail ?? null, phone: sub?.leadMobile ?? null },
  });

  return NextResponse.redirect(await backTo(link.tenantId, true), 303);
}
