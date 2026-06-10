import crypto from "node:crypto";

/**
 * HMAC-SHA256 signature for webhook bodies. Receivers verify the
 * `X-Assess-Signature` header against the shared endpoint secret to confirm the
 * payload originated from Assess360 and was not tampered with.
 */
export function signWebhookBody(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/** Generate a new endpoint signing secret. */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}
