/** Pure per-tenant CORS helpers for the public read endpoint. */

/** scheme://host[:port] of a URL, or null if it can't be parsed. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * An origin is allowed only if it exactly matches one of the allowed origins.
 * Never wildcards; an empty/unknown allow-list allows nothing.
 */
export function isOriginAllowed(
  origin: string | null | undefined,
  allowed: (string | null | undefined)[],
): boolean {
  if (!origin) return false;
  return allowed.some((a) => Boolean(a) && a === origin);
}
