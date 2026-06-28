import "server-only";
import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * Razorpay provider — thin wrapper over the REST API (Basic auth, no SDK), ported
 * from VidaPulse. NOW: one-time Payment Links for the assessment unlock. LATER:
 * createSubscription/createOrder for the Starter/Pro tiers plug in here.
 */

const API_BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15_000;

export function isRazorpayConfigured(): boolean {
  return !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

function authHeader(): string {
  const token = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

async function razorpayRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!isRazorpayConfigured()) throw new Error("Razorpay API keys not configured.");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: authHeader(), "content-type": "application/json" },
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

/**
 * Create a Razorpay Order. The client opens Razorpay Checkout against this order
 * with the lead's details PREFILLED (so the customer isn't asked to type anything),
 * and on success Razorpay redirects (callback_url) to our verify route.
 */
export async function createOrder(opts: {
  amountPaise: number;
  currency?: string;
  notes?: Record<string, string>;
}): Promise<OrderResult> {
  return razorpayRequest<OrderResult>("POST", "/orders", {
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
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Verify a Razorpay webhook signature (HMAC-SHA256 of the raw body with the
 * webhook secret). When no secret is configured, returns true (verification off)
 * — mirrors VidaPulse so the endpoint works before the secret is set.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Stricter check: TRUE only when a secret IS configured AND the signature is valid
 * (unlike verifyWebhookSignature, which is permissive when no secret is set so
 * payments still record). Use this to gate side effects that an unauthenticated
 * caller must NEVER trigger — e.g. firing a Meta conversion / CRM event.
 */
export function isWebhookSignatureVerified(rawBody: string, signature: string | null): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
