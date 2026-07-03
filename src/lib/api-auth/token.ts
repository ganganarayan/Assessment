import { randomBytes, createHash } from "crypto";
import { generateId } from "@/lib/ids";

/**
 * Bearer-token generation + hashing for the scoped external API layer.
 *
 * The plaintext is `<scope-prefix>_<pubId>_<secret>` and is shown to the admin
 * exactly once at mint time; only the sha256 hash is persisted. `prefix`
 * (`<scope-prefix>_<pubId>`) is a NON-secret identifier safe to show in the
 * admin list so a token can be recognised without revealing it.
 */

const SCOPE_PREFIX: Record<string, string> = { meta_match: "mm" };

function scopePrefix(scope: string): string {
  return SCOPE_PREFIX[scope] ?? "at";
}

export function hashApiToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateApiToken(scope: string): {
  plaintext: string;
  tokenHash: string;
  prefix: string;
} {
  const pub = generateId(6); // no-ambiguous-char public id (from lib/ids)
  const secret = randomBytes(24).toString("base64url"); // ~32 chars of entropy
  const prefix = `${scopePrefix(scope)}_${pub}`;
  const plaintext = `${prefix}_${secret}`;
  return { plaintext, tokenHash: hashApiToken(plaintext), prefix };
}
