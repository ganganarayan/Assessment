import type { PaymentCheckout } from "@/lib/payments/types";

/**
 * Test Payment: plain constants and types, safe on both sides of the wire.
 *
 * Kept out of the actions file on purpose: a "use server" file may export only async
 * functions, and a const exported from one passes typecheck and then fails the Railway
 * build.
 */

/** The Payment.purpose a test charge is ledgered under. Every revenue, stats, CRM and
 *  Meta query filters by an explicit purpose, so this one is invisible to all of them. */
export const TEST_PAYMENT_PURPOSE = "connection_test";

/** The currencies the test row offers. */
export const TEST_PAYMENT_CURRENCIES = ["INR", "USD"] as const;
export type TestPaymentCurrency = (typeof TEST_PAYMENT_CURRENCIES)[number];

/** Smallest and largest test amount, in major units (rupees or dollars). */
export const TEST_PAYMENT_MIN = 1;
export const TEST_PAYMENT_MAX = 100;

export type TestPaymentAccount = "GST" | "NON_GST";

export type StartTestPaymentResult =
  | { ok: true; checkout: PaymentCheckout }
  | { ok: false; error: string };
