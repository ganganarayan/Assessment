import { type PaymentCheckout } from "@/lib/payments/types";

/**
 * Opens Razorpay Checkout with the lead's details prefilled, so the customer goes
 * straight to payment methods (no details form). With redirect:true + callback_url,
 * Razorpay redirects to our verify route on success (which then sends them to the
 * VSL with the token). Client-only (uses window/document).
 */

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  notes: Record<string, string>;
  callback_url: string;
  redirect: boolean;
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open: () => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Razorpay"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Drop empty prefill fields so Razorpay doesn't render blank inputs. */
function cleanPrefill(p: PaymentCheckout["prefill"]): { name?: string; email?: string; contact?: string } {
  const out: { name?: string; email?: string; contact?: string } = {};
  if (p.name) out.name = p.name;
  if (p.email) out.email = p.email;
  if (p.contact) out.contact = p.contact;
  return out;
}

export async function openRazorpayCheckout(p: PaymentCheckout, onDismiss: () => void): Promise<void> {
  await loadScript();
  if (!window.Razorpay) throw new Error("Razorpay unavailable");
  const rzp = new window.Razorpay({
    key: p.keyId,
    order_id: p.orderId,
    amount: p.amount,
    currency: p.currency,
    name: p.name,
    description: p.description,
    prefill: cleanPrefill(p.prefill),
    notes: p.notes,
    callback_url: p.callbackUrl,
    redirect: true,
    modal: { ondismiss: onDismiss },
  });
  rzp.open();
}
