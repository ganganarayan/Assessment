/** Razorpay Checkout config the server hands the client to open the payment UI
 *  with the lead's details prefilled. Plain types (safe to import client-side). */
export interface PaymentCheckout {
  keyId: string;
  orderId: string;
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
  /** The tenant's logo for the checkout header (https only). Absent = Razorpay's own. */
  image?: string | null;
  /** The tenant's colour for the checkout chrome. */
  themeColor?: string | null;
  prefill: { name: string | null; email: string | null; contact: string | null };
  callbackUrl: string;
  notes: Record<string, string>;
}
