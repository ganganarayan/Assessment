/**
 * Client-side ad-parameter relay: keeps the params an ad click arrived with on the
 * URL, all the way from the marketing page to the funnel and on to signup.
 *
 * This is the VISIBLE half of attribution. The invisible half already exists and is
 * the one that cannot be lost: middleware writes the known utm/click-id params to the
 * httpOnly `a360_attr` cookie (90 days) on any page hit that carries them, and account
 * creation reads it into the acqUtm* columns. That cookie is unreadable from here by
 * design, so this module never tries - it reads the URL instead.
 *
 * Why bother, then? Because the cookie's allowlist is fixed and server-only, while the
 * funnel's own submission row, its Meta events and anything the operator reads off the
 * URL only see what is actually ON the URL. A CTA that drops the query string makes the
 * whole funnel look like direct traffic in every report that is not the signup record.
 *
 * sessionStorage is the carry for an internal hop (landing -> /pricing -> CTA): the
 * params are off the URL by then, and this restores them for the next link. Same tab
 * only, which is the right lifetime for a single visit - the cookie covers the rest.
 */

/** Click identifiers the ad platforms append. Everything `utm_*` travels by prefix. */
const CLICK_ID_KEYS = [
  "fbclid",
  "gclid",
  "ttclid",
  "msclkid",
  "wbraid",
  "gbraid",
  "li_fat_id",
  "twclid",
] as const;

const STORE_KEY = "a360_ad_params";
/** Caps, so a hand-crafted URL cannot push an unbounded query onto every link. */
const MAX_PARAMS = 12;
const MAX_VALUE = 512;

function isAdParam(key: string): boolean {
  return key.startsWith("utm_") || (CLICK_ID_KEYS as readonly string[]).includes(key);
}

/** Every ad param in a query string, in the order it appeared. */
export function pickAdParams(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return out;
  }
  for (const [key, value] of params.entries()) {
    if (Object.keys(out).length >= MAX_PARAMS) break;
    if (!isAdParam(key) || !value.trim() || key in out) continue;
    out[key] = value.trim().slice(0, MAX_VALUE);
  }
  return out;
}

/**
 * The ad params for this visit: the current URL's if it has any (and remember them for
 * the rest of the tab), otherwise the ones remembered from an earlier page.
 */
export function currentAdParams(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const fromUrl = pickAdParams(window.location.search);
  if (Object.keys(fromUrl).length > 0) {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(fromUrl));
    } catch {
      /* private mode / storage disabled: the cookie still carries attribution */
    }
    return fromUrl;
  }

  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isAdParam(key) && typeof value === "string" && value.trim()) {
        out[key] = value.trim().slice(0, MAX_VALUE);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Add this visit's ad params to an internal href, without disturbing what it already
 * carries (a prefilled email, a preview flag) or touching a bare anchor or an external
 * link. Returns the href unchanged when there is nothing to add.
 */
export function withAdParams(href: string, params = currentAdParams()): string {
  const keys = Object.keys(params);
  if (keys.length === 0) return href;
  // Anchors, mailto/tel and absolute URLs are not ours to rewrite.
  if (!href.startsWith("/")) return href;

  const [pathAndQuery, hash] = splitHash(href);
  const [path, query = ""] = splitQuery(pathAndQuery);
  const search = new URLSearchParams(query);
  for (const key of keys) {
    const value = params[key];
    if (value && !search.has(key)) search.set(key, value);
  }
  const qs = search.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash}`;
}

function splitHash(href: string): [string, string] {
  const i = href.indexOf("#");
  return i === -1 ? [href, ""] : [href.slice(0, i), href.slice(i)];
}

function splitQuery(href: string): [string, string?] {
  const i = href.indexOf("?");
  return i === -1 ? [href, undefined] : [href.slice(0, i), href.slice(i + 1)];
}
