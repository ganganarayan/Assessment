import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Email click-tracking helpers.
 *
 * We rewrite every absolute http(s) link in an outgoing email to a redirect
 * through /e/c/<logId>?u=<base64url original>. The redirect stamps NurtureLog
 * .clickedAt (first click) and 302s to the real URL. Opens are deliberately NOT
 * tracked - pixel opens are noisy (Apple Mail Privacy Protection pre-loads them,
 * image blockers miss real ones); a click is the reliable engagement signal.
 */

/** URL-safe encode of the original destination (base64url = no +/=, query-safe). */
export function encodeTrackedUrl(url: string): string {
  return Buffer.from(url, "utf8").toString("base64url");
}

/** Reverse of encodeTrackedUrl. Returns null on malformed input. */
export function decodeTrackedUrl(s: string): string | null {
  try {
    const out = Buffer.from(s, "base64url").toString("utf8");
    return out || null;
  } catch {
    return null;
  }
}

/**
 * Signature over (log id, encoded destination). Without it /e/c was an open redirect:
 * anyone could build /e/c/x?u=<any site> on our domain - or a tenant's - and the link
 * would look like ours in every preview. Truncated to 22 chars (132 bits), plenty for a
 * link, and short enough not to bloat every href in an email.
 */
export function trackedUrlSignature(logId: string, encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(`${logId}.${encoded}`).digest("base64url").slice(0, 22);
}

/** Constant-time check of a signature from the query against the expected one. */
export function trackedUrlSignatureValid(logId: string, encoded: string, sig: string, secret: string): boolean {
  const a = Buffer.from(trackedUrlSignature(logId, encoded, secret), "utf8");
  const b = Buffer.from(sig, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rewrite absolute http(s) `href` links in an email's HTML to the click-redirect.
 * Only http/https links are wrapped; mailto:, tel:, #anchors and relative links are
 * left untouched. A body with no links is returned unchanged (e.g. the SMTP test).
 */
export function instrumentEmailLinks(html: string, logId: string, appBase: string, secret: string): string {
  const base = appBase.replace(/\/+$/, "");
  return html.replace(
    /href\s*=\s*(["'])(https?:\/\/[^"'\s]+)\1/gi,
    (_m, quote: string, url: string) => {
      const u = encodeTrackedUrl(url);
      return `href=${quote}${base}/e/c/${logId}?u=${u}&amp;s=${trackedUrlSignature(logId, u, secret)}${quote}`;
    },
  );
}
