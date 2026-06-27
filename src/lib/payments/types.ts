/** Razorpay Checkout config the server hands the client to open the payment UI
 *  with the lead's details prefilled. Plain types (safe to import client-side). */
export interface PaymentCheckout {
  keyId: string;
  orderId: string;
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
  prefill: { name: string | null; email: string | null; contact: string | null };
  callbackUrl: string;
  notes: Record<string, string>;
}
