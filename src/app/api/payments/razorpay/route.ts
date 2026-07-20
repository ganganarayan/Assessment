import { handleRazorpayWebhook } from "@/lib/payments/razorpay-webhook";

/**
 * Razorpay webhook — POST /api/payments/razorpay (public; called by Razorpay).
 * PLATFORM / Gita tenant (tenantId = null): HMAC-verified with the singleton's
 * webhook secret, falling back to RAZORPAY_WEBHOOK_SECRET (env).
 *
 * Per-tenant funnels point Razorpay at /api/payments/razorpay/[tenant] instead,
 * which verifies with that tenant's own webhook secret.
 *
 * Dashboard → Settings → Webhooks:
 *   URL: https://assess.applygitawisdom.com/api/payments/razorpay
 *   Events: payment.captured (+ payment_link.paid)
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleRazorpayWebhook(req, null);
}
