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
