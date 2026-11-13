"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createOrder, isRazorpayConfigured } from "@/lib/payments/razorpay";
import { resolveRazorpayAccount } from "@/lib/settings/config";
import { resolveActingScope, scopeEditDenied, scopeOwnerDenied } from "@/lib/tenant/acting";
import { featureDenied } from "@/lib/features/release";
import { toMinor } from "@/lib/region/money";
import {
  type StartTestPaymentResult,
  TEST_PAYMENT_CURRENCIES,
  TEST_PAYMENT_MAX,
  TEST_PAYMENT_MIN,
  TEST_PAYMENT_PURPOSE,
} from "@/features/payments/test-payment-shared";

/**
 * Start a Test Payment on one of THIS scope's Razorpay accounts: create an order for the
 * amount typed and hand back the Checkout config. A real charge, on the workspace's own
 * account, recorded as connection_test (see lib/payments/test-payment-record.ts).
 *
 * Scope comes from the session, never the browser: a tenant admin tests their own
 * account, a super admin inside a workspace tests that workspace's, and a super admin
 * outside one tests the platform's keys.
 */

const Input = z.object({
  account: z.enum(["GST", "NON_GST"]),
  amount: z.number().finite().min(TEST_PAYMENT_MIN).max(TEST_PAYMENT_MAX),
  currency: z.enum(TEST_PAYMENT_CURRENCIES),
  /** Which settings screen to come back to. */
  back: z.enum(["w", "admin"]),
});

export async function startTestPayment(raw: unknown): Promise<StartTestPaymentResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `Enter an amount from ${TEST_PAYMENT_MIN} to ${TEST_PAYMENT_MAX}.` };
  }
  const { account, amount, currency, back } = parsed.data;

  const scope = await resolveActingScope();
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const denied = scopeEditDenied(scope) ?? scopeOwnerDenied(scope);
  if (denied) return denied;
  const held = await featureDenied("testPayment", scope.tenantId);
  if (held) return held;

  const tenantId = scope.tenantId; // null = the platform's own keys
  const keys = await resolveRazorpayAccount(tenantId, account);
  if (!isRazorpayConfigured(keys) || !keys.keyId) {
    return { ok: false, error: "Save this account's Key ID and Key secret first." };
  }

  const amountMinor = toMinor(amount, currency);
  const scopeTag = tenantId ?? "_platform";

  let order;
  try {
    order = await createOrder(
      {
        amountPaise: amountMinor,
        currency,
        // The binding the verify route and the webhook both check: a signed payment is
        // only booked as a test when its own order says so, for this scope and account.
        notes: { purpose: TEST_PAYMENT_PURPOSE, scope: scopeTag, account },
      },
      keys,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[test-payment] order create failed:", msg);
    return {
      ok: false,
      error:
        currency === "USD"
          ? "Razorpay refused the order. USD needs International Payments switched on in this Razorpay account."
          : "Razorpay refused the order. Check this account's Key ID and Key secret.",
    };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const qs = new URLSearchParams({ scope: scopeTag, account, back });

  return {
    ok: true,
    checkout: {
      keyId: keys.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      name: "Test payment",
      description: `Test payment, ${account === "GST" ? "GST" : "Non-GST"} account`,
      prefill: { name: scope.user.name ?? null, email: scope.user.email ?? null, contact: null },
      callbackUrl: `${proto}://${host}/api/pay/test/verify?${qs.toString()}`,
      notes: { purpose: TEST_PAYMENT_PURPOSE, scope: scopeTag, account },
    },
  };
}
