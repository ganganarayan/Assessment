import { randomBytes } from "node:crypto";

/**
 * Minting and sanitising R2 object keys for the Vault.
 *
 * 🔴 ONE PLACE, and the key it returns is never rewritten afterwards. The whole point
 * of the Vault's design is that a link handed to VidaPulse, an LMS or a landing page
 * keeps resolving however the file is later renamed or reorganised, and that only
 * holds while nothing composes or edits a key anywhere else.
 *
 * Shape: v/<random>/<safe-filename>
 *
 * The random segment is what makes the key immune to reorganisation - it carries no
 * folder, no tenant, no date, nothing that can go stale. The filename rides along as
 * the last segment purely so the object is recognisable in the Cloudflare dashboard;
 * nothing reads it back, and it is allowed to drift from the display name after a
 * rename.
 */

/**
 * A filename reduced to something safe in a URL path segment.
 *
 * Deliberately strict. The result ends up in a public URL, so anything that could
 * change how that URL parses - a slash, a traversal, a percent, whitespace - is
 * replaced rather than escaped. An empty result falls back to "file", because a key
 * ending in a bare slash is a directory marker in every S3 tool that reads it.
 */
export function safeFilename(input: string): string {
  const base = (input ?? "").split(/[\/]/).pop() ?? "";
  const cleaned = base
    .toLowerCase()
    .normalize("NFKD")
    // Keep only what is unambiguous in a path segment.
    .replace(/[^a-z0-9._-]+/g, "-")
    // A run of dots is how traversal is spelled; collapse before anything else reads it.
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\-]+/, "")
    .replace(/[.\-]+$/, "")
    .slice(0, 100);
  return cleaned || "file";
}

/** The object key for a newly uploaded file. Called once, at ticket time. */
export function mintObjectKey(filename: string): string {
  return `v/${randomBytes(6).toString("hex")}/${safeFilename(filename)}`;
}

/**
 * The public URL for a key, or null when the bucket has no custom domain yet.
 *
 * Joined here rather than by each caller so a trailing slash on the base, or a leading
 * slash on the key, can never produce the double slash that silently 404s.
 */
export function publicUrlFor(publicBaseUrl: string | null, objectKey: string): string | null {
  if (!publicBaseUrl) return null;
  return `${publicBaseUrl.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
}

/**
 * A folder or bucket label typed by a person. Not a key - folders are database rows -
 * but still bounded, because it is rendered and stored.
 */
export function safeDisplayName(input: string): string {
  return (input ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120);
}

/**
 * Does this key look like one the Vault minted?
 *
 * 🔴 THE SAFETY TEST FOR RECONCILE. Reconcile compares what is in a bucket against what
 * the database knows, and anything in the bucket with no row is a candidate for
 * deletion - but only if the Vault put it there. A bucket can hold objects this app
 * never created: a cloud to cloud transfer, a hand upload in the Cloudflare dashboard,
 * another tool sharing the bucket. None of those have rows, and deleting them because
 * of that would destroy data the owner deliberately put there.
 *
 * So the rule is the opposite of trusting the database: an object is only ever
 * deletable if its key matches the shape mintObjectKey produces AND nothing references
 * it. Everything else is reported and left strictly alone.
 *
 * Kept next to mintObjectKey so the two cannot drift. If the minted shape ever changes,
 * this must learn the old shape as well, or reconcile will start calling every existing
 * file foreign and stop protecting anything.
 */
export function isMintedKey(key: string): boolean {
  return /^v\/[0-9a-f]{12}\/[^/]+$/.test(key);
}
