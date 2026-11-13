import { NextResponse } from "next/server";
import { verifyPaymentSignature, fetchOrder } from "@/lib/payments/razorpay";
import { resolveRazorpayAccount } from "@/lib/settings/config";
import { recordTestPayment } from "@/lib/payments/test-payment-record";
import { TEST_PAYMENT_PURPOSE } from "@/features/payments/test-payment-shared";

export const dynamic = "force-dynamic";

/**
 * Razorpay Checkout (redirect: true) POSTs here after a Test Payment from Settings.
 *
 * Checked the same way as a payment link's return: the signature against the keys of
 * the account named in the query, then the order's OWN notes must say it is a test for
 * this scope and this account. Anything that fails books nothing. The webhook books the
 * same payment on its own; whichever arrives first creates the row, the other stamps it.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const scopeTag = url.searchParams.get("scope") ?? "";
  const accountRaw = url.searchParams.get("account");
  const back = url.searchParams.get("back") === "admin" ? "admin" : "w";
  const account = accountRaw === "NON_GST" ? "NON_GST" : "GST";

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const backTo = (ok: boolean, paymentId?: string) => {
    const qs = new URLSearchParams({ testPayment: ok ? "ok" : "failed", account });
    if (paymentId) qs.set("pid", paymentId);
    return `${proto}://${host}/${back}/settings?${qs.toString()}`;
  };

  if (!scopeTag || accountRaw === null) return NextResponse.redirect(backTo(false), 303);
  const tenantId = scopeTag === "_platform" ? null : scopeTag;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.redirect(backTo(false), 303);
  }
  const paymentId = String(form.get("razorpay_payment_id") ?? "");
  const orderId = String(form.get("razorpay_order_id") ?? "");
  const signature = String(form.get("razorpay_signature") ?? "");
  if (!paymentId || !orderId || !signature) return NextResponse.redirect(backTo(false), 303);

  const keys = await resolveRazorpayAccount(tenantId, account);
  if (!verifyPaymentSignature(orderId, paymentId, signature, keys.keySecret)) {
    return NextResponse.redirect(backTo(false), 303);
  }

  let order;
  try {
    order = await fetchOrder(orderId, keys);
  } catch {
    return NextResponse.redirect(backTo(false), 303);
  }
  if (
    order.notes?.purpose !== TEST_PAYMENT_PURPOSE ||
    order.notes?.scope !== scopeTag ||
    order.notes?.account !== account
  ) {
    console.error("[test-payment] verify rejected: order notes do not match this test");
    return NextResponse.redirect(backTo(false), 303);
  }

  await recordTestPayment({
    tenantId,
    account,
    providerPaymentId: paymentId,
    providerOrderId: orderId,
    amountMinor: order.amount ?? null,
    currency: order.currency ?? "INR",
    method: null,
    via: "checkout",
    event: "test_payment.verified",
  });

  return NextResponse.redirect(backTo(true, paymentId), 303);
}
