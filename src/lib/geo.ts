/**
 * Visitor geo, read from Cloudflare's request headers. Pure: takes a header getter
 * so it works in middleware (edge) and server actions, and is unit-testable.
 *
 * Availability:
 *  - `cf-ipcountry` is added by Cloudflare on all plans by default.
 *  - city / region / postal / timezone / lat-long require the Cloudflare managed
 *    transform "Add visitor location headers" to be enabled on the zone. Until it
 *    is, those fields come back null (country still works). No external API call.
 */
export interface GeoContext {
  country: string | null; // 2-letter ISO (e.g. "IN")
  city: string | null;
  region: string | null; // state / province
  postalCode: string | null;
  timezone: string | null;
}

const EMPTY_GEO: GeoContext = {
  country: null,
  city: null,
  region: null,
  postalCode: null,
  timezone: null,
};

/** Cloudflare sends "XX" / "T1" for unknown or Tor exits — treat as no country. */
function cleanCountry(v: string | null): string | null {
  const c = (v ?? "").trim().toUpperCase();
  if (!c || c === "XX" || c === "T1") return null;
  return c;
}

function clean(v: string | null): string | null {
  const c = (v ?? "").trim();
  return c.length > 0 ? c.slice(0, 128) : null;
}

/** Read geo from a header getter (e.g. `(k) => headers().get(k)`). */
export function readGeoHeaders(get: (key: string) => string | null | undefined): GeoContext {
  const g = (k: string) => {
    const v = get(k);
    return typeof v === "string" ? v : null;
  };
  const country = cleanCountry(g("cf-ipcountry"));
  const city = clean(g("cf-ipcity"));
  const region = clean(g("cf-region"));
  const postalCode = clean(g("cf-postal-code"));
  const timezone = clean(g("cf-timezone"));
  if (!country && !city && !region && !postalCode && !timezone) return EMPTY_GEO;
  return { country, city, region, postalCode, timezone };
}
