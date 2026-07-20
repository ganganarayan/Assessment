import "server-only";
import crypto from "crypto";

/**
 * Razorpay provider — thin wrapper over the REST API (Basic auth, no SDK). Stateless:
 * every call takes the TENANT's keys/secret (resolved via lib/settings/config, which
 * falls back to env for the platform/Gita tenant), so each tenant transacts on its
 * OWN Razorpay account. One-time Payment/Order for the assessment unlock.
 */

const API_BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15_000;

export interface RazorpayKeys {
  keyId: string | null;
  keySecret: string | null;
}

export function isRazorpayConfigured(keys: RazorpayKeys): boolean {
  return !!(keys.keyId && keys.keySecret);
}

function authHeader(keys: RazorpayKeys): string {
  const token = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64");
  return `Basic ${token}`;
}

async function razorpayRequest<T>(method: string, path: string, keys: RazorpayKeys, body?: unknown): Promise<T> {
  if (!isRazorpayConfigured(keys)) throw new Error("Razorpay API keys not configured.");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: authHeader(keys), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Razorpay returned non-JSON (status ${res.status})`);
  }
  if (!res.ok) {
    const err = json as { error?: { description?: string; code?: string } } | null;
    throw new Error(`Razorpay API error (${res.status}): ${err?.error?.description ?? err?.error?.code ?? "unknown"}`);
  }
  return json as T;
}

export interface OrderResult {
  id: string;
  amount: number;
  currency: string;
}

export interface FetchedOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string> | null;
}

/**
 * Fetch an order by id — used to BIND a Checkout return to the order's OWN
 * submission + amount (from its notes), so a valid signed payment triple can't be
 * replayed against an arbitrary `?submission=` to unlock someone else's result.
 */
export async function fetchOrder(orderId: string, keys: RazorpayKeys): Promise<FetchedOrder> {
  return razorpayRequest<FetchedOrder>("GET", `/orders/${encodeURIComponent(orderId)}`, keys);
}

/**
 * Create a Razorpay Order. The client opens Razorpay Checkout against this order
 * with the lead's details PREFILLED (so the customer isn't asked to type anything),
 * and on success Razorpay redirects (callback_url) to our verify route.
 */
export async function createOrder(
  opts: {
    amountPaise: number;
    currency?: string;
    notes?: Record<string, string>;
  },
  keys: RazorpayKeys,
): Promise<OrderResult> {
  return razorpayRequest<OrderResult>("POST", "/orders", keys, {
    amount: opts.amountPaise,
    currency: opts.currency ?? "INR",
    payment_capture: true,
    ...(opts.notes ? { notes: opts.notes } : {}),
  });
}

/**
 * Verify the signature Razorpay returns for an order payment:
 * HMAC_SHA256(order_id + "|" + payment_id, key_secret). Confirms the payment is
 * genuine before we reveal the result token.
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string | null,
): boolean {
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Verify a Razorpay webhook signature (HMAC-SHA256 of the raw body with the tenant's
 * webhook secret). FAIL-CLOSED: when no secret is configured we reject — a public
 * money endpoint must never accept unauthenticated POSTs.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string | null): boolean {
  if (!webhookSecret) {
    console.error("[razorpay] webhook rejected: no webhook secret configured for this tenant");
    return false;
  }
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Stricter check: TRUE only when a secret IS configured AND the signature is valid.
 * Gate side effects an unauthenticated caller must NEVER trigger (Meta conversion / CRM).
 */
export function isWebhookSignatureVerified(rawBody: string, signature: string | null, webhookSecret: string | null): boolean {
  if (!webhookSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
