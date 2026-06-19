import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Symmetric encryption for secrets stored at rest (e.g. a tenant's LLM API key).
 * AES-256-GCM with a key derived from a caller-supplied secret — PURE (no env),
 * so it is unit-testable. The env-bound wrappers live in the callers.
 *
 * Format: "v1:<ivB64>:<tagB64>:<ciphertextB64>".
 */

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest(); // 32 bytes for AES-256
}

export function encryptWithSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptWithSecret(enc: string, secret: string): string | null {
  try {
    const [ver, ivB, tagB, ctB] = enc.split(":");
    if (ver !== "v1" || !ivB || !tagB || !ctB) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null; // tampered, wrong key, or malformed
  }
}

/** True for strings produced by encryptWithSecret (so callers can detect plaintext). */
export function isEncrypted(value: string): boolean {
  return value.startsWith("v1:") && value.split(":").length === 4;
}
