import { type PaymentCheckout } from "@/lib/payments/types";

/**
 * Payment-link constants and plain types - NO server imports, so both the public pay
 * page and the operator's table can use them.
 *
 * Kept out of the action files on purpose: a "use server" module may export async
 * functions and nothing else, so a constant living there breaks the Railway build
 * while passing typecheck locally.
 */

/** The two Razorpay accounts a tenant may hold. Mirrors RazorpayAccountKind. */
export type PaymentLinkAccount = "GST" | "NON_GST";

/** How each account is named wherever the operator has to choose one. */
export const ACCOUNT_LABEL: Record<PaymentLinkAccount, string> = {
  GST: "GST",
  NON_GST: "Non-GST",
};

/**
 * Floor, in paise, under which a payment page will not create an order. The CLIENT
 * types the amount here, so without a floor an agreed sale can arrive as ₹1 by a
 * stray keystroke. ₹1 is also Razorpay's own minimum, so this is ours, not theirs.
 */
export const PAY_MIN_PAISE = 100;

/**
 * Ceiling, in paise (₹10,00,000). Not a business limit - a typo guard. An extra
 * zero on a ₹1,00,000 invoice is the kind of mistake that is easier to prevent than
 * to refund.
 */
export const PAY_MAX_PAISE = 100_000_000;

/** One generated link, as the operator's table needs it. Client-safe (no secrets). */
export interface PaymentLinkView {
  id: string;
  url: string;
  account: PaymentLinkAccount;
  /** What the operator suggested, in rupees. The client may pay something else. */
  amount: number;
  status: "CREATED" | "PAID" | "CANCELLED";
  /** What was actually paid, in rupees. Null until it settles. */
  paidAmount: number | null;
  paidAt: string | null;
  createdAt: string;
}

/**
 * Results returned by the payment-link actions.
 *
 * They live HERE, not beside the actions, because a "use server" module may export
 * async functions and nothing else. A type is erased before that check in most
 * builds, which is exactly what makes it a bad place to keep one: it passes typecheck
 * and fails the deploy.
 */
export type CreateLinkResult = { ok: true; url: string } | { ok: false; error: string };
export type CancelLinkResult = { ok: boolean; error?: string };
export type PayOrderResult = { ok: true; checkout: PaymentCheckout } | { ok: false; error: string };
