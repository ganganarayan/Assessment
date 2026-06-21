/**
 * Marketing-attribution helpers shared by middleware (capture) and the opt-in /
 * page-view paths (read). Pure: no next/headers, so middleware can import it.
 */

/** Known attribution params captured from the landing URL. */
export const ATTR_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
] as const;

/** Last-touch attribution cookie: set in middleware, read at opt-in / page view. */
export const ATTR_COOKIE = "a360_attr";

/** Pick known attribution params via a getter (URLSearchParams.get or a record lookup). */
export function pickAttribution(
  get: (key: string) => string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ATTR_KEYS) {
    const v = get(key);
    if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, 512);
  }
  return out;
}
