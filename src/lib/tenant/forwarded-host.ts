/**
 * The hostname a request is REALLY for, when a proxy sits in front.
 *
 * 🔴 THE ATTACK THIS PREVENTS. With Cloudflare for SaaS, a tenant's request reaches
 * Railway with the Host rewritten to a host Railway routes, and the tenant's real
 * hostname carried in `x-forwarded-host`. If the app simply trusted that header, then
 * anyone could send
 *
 *     curl https://assess-production.up.railway.app/ -H 'x-forwarded-host: assess.acme.com'
 *
 * and be served as that tenant — their funnel, their branding, and whatever their
 * host resolves to. Railway's generated domain is public, so this is not theoretical.
 *
 * The header is therefore honoured ONLY alongside a shared secret that the Worker
 * attaches and nobody else knows. No secret configured, or no match, and the header is
 * ignored entirely — the app falls back to the real Host, which is always truthful.
 *
 * Deliberately dependency-free (no "server-only") so edge middleware can import it.
 */

/** Header the Worker uses to carry the customer's real hostname. */
export const FORWARDED_HOST_HEADER = "x-forwarded-host";

/** Header carrying the shared secret that proves the forwarded host came from us. */
export const PROXY_SECRET_HEADER = "x-assess-proxy";

/**
 * Resolve the effective hostname for tenant routing.
 *
 * `headers` is anything with a `get` (Headers, or Next's ReadonlyHeaders). Returns a
 * bare lowercase host with no port and no trailing dot, or "" when there is nothing.
 */
export function effectiveHost(headers: { get(name: string): string | null }): string {
  const direct = normalize(headers.get("host"));
  const secret = process.env.CLOUDFLARE_PROXY_SECRET;
  if (!secret) return direct;

  const presented = headers.get(PROXY_SECRET_HEADER);
  // Length check first so a missing header never reaches the comparison, and compare
  // the whole string — this gates routing, not authentication, but there is no reason
  // to be sloppy about it.
  if (!presented || presented.length !== secret.length || presented !== secret) return direct;

  const forwarded = normalize(headers.get(FORWARDED_HOST_HEADER));
  return forwarded || direct;
}

function normalize(raw: string | null | undefined): string {
  const v = (raw ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (!v) return "";
  const withoutPort = v.startsWith("[") ? v.slice(0, v.indexOf("]") + 1) : (v.split(":")[0] ?? "");
  return withoutPort.replace(/\.$/, "");
}
