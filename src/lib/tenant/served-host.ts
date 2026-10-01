import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { railwayRoutedHosts } from "@/lib/railway/domains";

/**
 * "Is this a hostname we serve?" — the ONE answer, for everything that needs it.
 *
 * 🔴 The bug this exists to end. Three separate things each held their own idea of
 * "our domain": Better Auth's trustedOrigins (an env list), its baseURL (one env
 * string), and the Domain table (the real, per-tenant list). The moment a domain
 * changed, they disagreed — and the symptom is brutal to read, because the origin
 * check runs on EVERY non-GET request and throws before anything else happens. Sign-in
 * returns "Invalid origin" without the password being checked; "Forgot password"
 * returns 403 before sendResetPassword runs, so no email is attempted while the screen
 * cheerfully says one was sent. Nothing in either message mentions domains.
 *
 * That cannot be fixed by editing env per domain: tenants bring their own, and an
 * env edit plus a redeploy for each one is not a system. So the question is answered
 * from the data that already decides routing.
 *
 * 🟡 Why not simply trust the Host header. Because the reset link is built from it. A
 * forged `Host: evil.com` would mint a password-reset URL pointing at the attacker and
 * mail it to the real user — account takeover from one header. Every host is therefore
 * checked against the list below, and anything unrecognised falls back to canonical.
 */

/** Strip port, lowercase, drop a trailing dot ("example.com." is the same host). */
export function normalizeHost(host: string | null | undefined): string {
  const h = (host ?? "").trim().toLowerCase();
  if (!h) return "";
  // IPv6 literals arrive bracketed ("[::1]:3000") — keep the bracketed part intact.
  const withoutPort = h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : (h.split(":")[0] ?? "");
  return withoutPort.replace(/\.$/, "");
}

/** The app's canonical host, from env. Bootstrap only — never the sole authority. */
export function canonicalHost(): string {
  for (const candidate of [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL]) {
    try {
      const h = normalizeHost(new URL(candidate).host);
      if (h) return h;
    } catch {
      /* malformed env value — try the next */
    }
  }
  return normalizeHost(env.NEXT_PUBLIC_ROOT_DOMAIN);
}

/** The canonical origin (scheme + host), used whenever a host can't be trusted. */
export function canonicalOrigin(): string {
  for (const candidate of [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL]) {
    try {
      return new URL(candidate).origin;
    } catch {
      /* malformed env value — try the next */
    }
  }
  return `https://${normalizeHost(env.NEXT_PUBLIC_ROOT_DOMAIN)}`;
}

/** Local development hosts, which never have a Domain row. */
function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}

/** The root domain itself, or any subdomain of it (tenant.<root>). */
function isRootOrSubdomain(host: string): boolean {
  const root = normalizeHost(env.NEXT_PUBLIC_ROOT_DOMAIN);
  if (!root) return false;
  return host === root || host.endsWith(`.${root}`);
}

/**
 * Domain-table lookups, cached briefly.
 *
 * trustedOrigins runs on every non-GET request, so an uncached miss would put a query
 * in front of every sign-in. 60s is short enough that a freshly added domain starts
 * working on its own (the tenant is still in the DNS/cert wait anyway) and long enough
 * that a burst of requests costs one query.
 */
const CACHE_TTL_MS = 60_000;
/** Hard cap: the key is a request-supplied hostname, so an attacker spraying random
 *  Host headers would otherwise grow this map without bound. Past the cap the whole
 *  map is dropped — the cost is one query per host afterwards, never memory. */
const CACHE_MAX = 500;
const cache = new Map<string, { served: boolean; at: number }>();

async function hasDomainRow(host: string): Promise<boolean> {
  const hit = cache.get(host);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.served;
  let served = false;
  try {
    // Deliberately NOT filtered on `verified`. Verified means "the cert is live",
    // which is a provisioning milestone — but if a request is physically arriving on
    // this host, it already routes here, and refusing to authenticate it only locks
    // the tenant out of the screen they'd use to finish setting it up.
    const row = await prisma.domain.findUnique({ where: { hostname: host }, select: { id: true } });
    served = !!row;
  } catch (e) {
    // A DB blip must not silently un-trust every custom domain; it also must not
    // invent trust. Report not-served and leave the cache alone so the next request
    // retries rather than inheriting a failure for a minute.
    console.error("[served-host] domain lookup failed:", e instanceof Error ? e.message : String(e));
    return false;
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(host, { served, at: now });
  return served;
}

/** Forget a cached answer — call after a domain is added or removed. */
export function forgetServedHost(host: string | null | undefined): void {
  const h = normalizeHost(host);
  if (h) cache.delete(h);
}

/**
 * Hosts Railway routes to this service — the PRIMARY source of truth.
 *
 * 🟢 Why this and not a row or an env var. A request physically arrives on a Host only
 * because Railway routes that Host to this service. So Railway's own list is, by
 * definition, the set of hosts we serve. Point a domain at the service and it
 * authenticates; detach it and it stops — no env edit, no redeploy, no command, and
 * nothing to keep in sync. Changing the platform's domain tomorrow just works.
 *
 * Cached for 5 minutes, with one in-flight request shared between callers, because
 * this sits in front of every non-GET request.
 *
 * 🟡 On failure the LAST GOOD list is kept and reused past its TTL. A Railway API blip
 * must never un-trust every domain at once — that would lock every tenant out of their
 * own site until the API recovered. Stale-but-working beats correct-and-down.
 */
const ROUTED_TTL_MS = 5 * 60_000;
/** After a failed lookup, wait this long before asking again. Without it a Railway
 *  outage would mean one 15s-timeout API call in front of EVERY sign-in — the API
 *  hammered and the app crawling, at the worst possible moment. */
const ROUTED_RETRY_MS = 30_000;
let routed: { hosts: string[]; at: number } | null = null;
let routedAttemptedAt = 0;
let routedInFlight: Promise<string[] | null> | null = null;

async function railwayServes(host: string): Promise<boolean> {
  const now = Date.now();
  const stale = !routed || now - routed.at >= ROUTED_TTL_MS;
  if (stale && now - routedAttemptedAt >= ROUTED_RETRY_MS) {
    routedAttemptedAt = now;
    routedInFlight ??= railwayRoutedHosts().finally(() => {
      routedInFlight = null;
    });
    const fresh = await routedInFlight;
    // null = couldn't ask. Keep whatever we had rather than dropping to "nothing".
    if (fresh) routed = { hosts: fresh, at: Date.now() };
  }
  return routed?.hosts.includes(host) ?? false;
}

/** Forget the routed-host list — call after adding or removing a Railway domain. */
export function forgetRoutedHosts(): void {
  routed = null;
  routedAttemptedAt = 0;
}

/**
 * Is this hostname one this app serves?
 *
 * In order: the canonical host, the root domain or a subdomain, a local dev host (all
 * free), then Railway's routed list (one cached call that covers every domain at
 * once), then a Domain row as the backstop for when Railway isn't configured or hasn't
 * caught up yet.
 */
export async function isServedHost(host: string | null | undefined): Promise<boolean> {
  const h = normalizeHost(host);
  if (!h) return false;
  if (h === canonicalHost() || isRootOrSubdomain(h) || isLocalHost(h)) return true;
  if (await railwayServes(h)) return true;
  return hasDomainRow(h);
}

/** The scheme a request arrived on, honouring the proxy header Railway sets. */
function schemeOf(headers: Headers, host: string): string {
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "http" || forwarded === "https") return forwarded;
  return isLocalHost(normalizeHost(host)) ? "http" : "https";
}

/**
 * The origin a link mailed to this request's user should point at: the host they are
 * actually using when we serve it, else canonical. This is what makes a reset link
 * land back on the tenant's own domain instead of ours — and what stops a forged Host
 * header from redirecting the token somewhere else.
 */
export async function originForRequest(request: Request | undefined | null): Promise<string> {
  if (!request) return canonicalOrigin();
  const headers = request.headers;
  // x-forwarded-host is what a proxy preserves; Host is the direct value.
  const raw = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host") || "";
  if (!raw) return canonicalOrigin();
  if (!(await isServedHost(raw))) {
    console.error(`[served-host] refusing to build a link on an unrecognised host: ${normalizeHost(raw)}`);
    return canonicalOrigin();
  }
  // Keep the port for local development ("localhost:3000"); strip nothing else.
  const hostForUrl = raw.trim().toLowerCase().replace(/\.$/, "");
  return `${schemeOf(headers, hostForUrl)}://${hostForUrl}`;
}

/**
 * Re-home an absolute URL that Better Auth built from its static baseURL onto the
 * origin the request actually came in on. Path, query and token are preserved
 * untouched; only the origin moves.
 */
export async function linkForRequest(url: string, request: Request | undefined | null): Promise<string> {
  const origin = await originForRequest(request);
  try {
    const u = new URL(url);
    const target = new URL(origin);
    u.protocol = target.protocol;
    u.host = target.host;
    return u.toString();
  } catch {
    return url; // not absolute — leave it exactly as Better Auth produced it
  }
}
