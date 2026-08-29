import "server-only";
import { headers, cookies } from "next/headers";
import { readGeoHeaders } from "@/lib/geo";
import { parseUserAgent } from "@/lib/user-agent";

/**
 * Pull the visitor's match signals from the current request for Meta CAPI + lead
 * enrichment: client IP, user agent, the Meta browser cookies (_fbp / _fbc), plus
 * derived geo (Cloudflare headers) and device (parsed UA). These raise the server
 * event's match quality and enrich the contact. Server-only (uses next/headers).
 */
export interface MetaRequestContext {
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  // Geo (Cloudflare). region/postalCode map to Meta st/zp; country is 2-letter ISO.
  country: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  timezone: string | null;
  // Device (parsed from the UA).
  deviceType: string | null;
  browser: string | null;
  os: string | null;
}

const EMPTY: MetaRequestContext = {
  clientIpAddress: null,
  clientUserAgent: null,
  fbp: null,
  fbc: null,
  country: null,
  city: null,
  region: null,
  postalCode: null,
  timezone: null,
  deviceType: null,
  browser: null,
  os: null,
};

export async function getMetaRequestContext(): Promise<MetaRequestContext> {
  // Fail-soft: this only enriches match quality. If the dynamic APIs ever throw
  // (e.g. called outside a request scope), return empty signals — never let it
  // surface into the submission flow.
  try {
    const h = await headers();
    const c = await cookies();

    // x-forwarded-for is a comma-separated list (client first) behind a proxy.
    const xff = h.get("x-forwarded-for");
    const ip = xff ? (xff.split(",")[0]?.trim() ?? null) : (h.get("x-real-ip") ?? null);
    const ua = h.get("user-agent");
    const geo = readGeoHeaders((k) => h.get(k));
    const device = parseUserAgent(ua);

    return {
      clientIpAddress: ip && ip.length > 0 ? ip : null,
      clientUserAgent: ua,
      fbp: c.get("_fbp")?.value ?? null,
      fbc: c.get("_fbc")?.value ?? null,
      country: geo.country,
      city: geo.city,
      region: geo.region,
      postalCode: geo.postalCode,
      timezone: geo.timezone,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
    };
  } catch {
    return EMPTY;
  }
}
