import "server-only";

/**
 * Email click-tracking helpers.
 *
 * We rewrite every absolute http(s) link in an outgoing email to a redirect
 * through /e/c/<logId>?u=<base64url original>. The redirect stamps NurtureLog
 * .clickedAt (first click) and 302s to the real URL. Opens are deliberately NOT
 * tracked — pixel opens are noisy (Apple Mail Privacy Protection pre-loads them,
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
 * Rewrite absolute http(s) `href` links in an email's HTML to the click-redirect.
 * Only http/https links are wrapped; mailto:, tel:, #anchors and relative links are
 * left untouched. A body with no links is returned unchanged (e.g. the SMTP test).
 */
export function instrumentEmailLinks(html: string, logId: string, appBase: string): string {
  const base = appBase.replace(/\/+$/, "");
  return html.replace(
    /href\s*=\s*(["'])(https?:\/\/[^"'\s]+)\1/gi,
    (_m, quote: string, url: string) =>
      `href=${quote}${base}/e/c/${logId}?u=${encodeTrackedUrl(url)}${quote}`,
  );
}
