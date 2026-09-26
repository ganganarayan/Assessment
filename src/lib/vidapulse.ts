/**
 * VidaPulse identity bridge — the tiny, pure surface shared by the server (result
 * data action) and the client (VSL video block + destination redirect).
 *
 * The idea (borrowed from Meta `external_id` / Google `user_id`): we mint one opaque,
 * NON-PII id (Submission.customerId) and hand it to VidaPulse verbatim through the
 * embed URL, so VidaPulse can bind its own customer/click record to ours. Only the
 * opaque token ever crosses — never name/email/phone — so it is safe in a URL.
 *
 * Kept in a plain module (no "use server") so both the client component and server
 * action can import it without pulling a server action into the bundle.
 */

/** Default query-param name when a tenant has not overridden it. */
export const DEFAULT_VIDAPULSE_PARAM = "cid";

type VidapulseSettingRow = {
  vidapulseTrackingEnabled: boolean;
  vidapulseParam: string;
} | null;

/**
 * Resolve the effective param name for a tenant's AppSetting row.
 *  - no row (tenant never configured) => ON with the default ("cid")
 *  - row with tracking disabled       => null (do not append)
 *  - row enabled                      => its param, or the default if blank
 */
export function resolveVidapulseParam(setting: VidapulseSettingRow): string | null {
  if (setting && !setting.vidapulseTrackingEnabled) return null;
  return (setting?.vidapulseParam ?? "").trim() || DEFAULT_VIDAPULSE_PARAM;
}

/**
 * Append the opaque customerId to an absolute http(s) URL under `param`. Returns the
 * URL unchanged when the param/customerId is missing or the URL is not absolute (a
 * relative/blank embed is left alone), so callers can pass it through unconditionally.
 */
export function appendVidapulseId(
  url: string,
  param: string | null,
  customerId: string | null,
): string {
  if (!param || !customerId) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(param, customerId);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * True for a VidaPulse CTA *tracking* link — the redirect that records a click
 * before forwarding to the real destination:
 *   https://app.vidapulse.io/api/analytics/cta/link/<uuid>
 *   https://app.vidapulse.io/api/analytics/cta/<video uuid>?to=...
 *
 * Matched on the PATH only, never the host: a tenant may serve VidaPulse from
 * its own domain, and hardcoding app.vidapulse.io would silently stop stamping
 * the day one does. Nothing else on a page is ever rewritten, so an ordinary
 * link the owner typed stays byte-identical.
 */
export function isVidapulseCtaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /\/api\/analytics\/cta\//i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Stamp a VidaPulse CTA tracking link with who is clicking it.
 *
 * WHY BOTH IDS, AND WHY IN THE URL
 * The token (`t`) rides on every link this app emits — fresh completions and
 * every email/WhatsApp nurture link alike — so it is the one that is reliably
 * present; the customerId (`cid`) is the opaque join key. Both are sent, and
 * VidaPulse stores both.
 *
 * They go in the URL rather than being left to the Referer header because that
 * header is the carrier that fails exactly when it matters: our own CTA anchors
 * carry rel="noreferrer", page builders set referrer policies, and the in-app
 * browsers inside Facebook and Instagram strip it outright. A query param
 * survives all three.
 *
 * Non-CTA URLs, relative URLs and blank values are returned untouched, so
 * callers can pass anything through unconditionally. `vpsrc` tells VidaPulse
 * which carrier supplied the id, so coverage gaps are diagnosable later.
 *
 * Note this deliberately ignores the tenant's `vidapulseParam` override: these
 * are the fixed param names VidaPulse's CTA endpoint reads, not the embed
 * param a tenant may rename.
 */
export function stampVidapulseCtaUrl(
  url: string | null | undefined,
  customerId: string | null,
  resultToken: string | null,
): string | null {
  const original = url ?? null;
  if (!original || (!customerId && !resultToken)) return original;
  if (!isVidapulseCtaUrl(original)) return original;
  try {
    const u = new URL(original);
    if (resultToken && !u.searchParams.get("t")) u.searchParams.set("t", resultToken);
    if (customerId && !u.searchParams.get("cid")) u.searchParams.set("cid", customerId);
    u.searchParams.set("vpsrc", "url");
    return u.toString();
  } catch {
    return original;
  }
}
