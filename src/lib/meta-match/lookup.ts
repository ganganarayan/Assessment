/**
 * Pure helpers for the Meta-match lookup (no DB / no env) so they are unit
 * testable. Normalization for the email+phone key, and the stable response
 * shape the endpoint returns. Values are returned RAW (unhashed) — the caller
 * (n8n) hashes before sending to Meta.
 */

export function normalizeEmail(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return s.length ? s : null;
}

/** Digits only (drops +, spaces, hyphens). Null when there are none. */
export function phoneDigits(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length ? d : null;
}

/** Last 10 digits — the stable national-number key (country code varies). */
export function phoneLast10(v: string | null | undefined): string | null {
  const d = phoneDigits(v);
  if (!d) return null;
  return d.length >= 10 ? d.slice(-10) : d;
}

/** The subset of a Submission the lookup reads. */
export interface MetaMatchRecord {
  leadEmail: string | null;
  leadMobile: string | null;
  clientIp: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  fbclidTimestamp: number | null;
  startedAt: Date | null;
  attribution: unknown;
}

/** Stable response shape — every field always present (null when unknown). */
export interface MetaMatchResponse {
  found: boolean;
  email: string | null;
  phone: string | null;
  fbclid: string | null;
  fbclid_timestamp: number | null;
  optin_timestamp: number | null;
  fbp: string | null;
  fbc: string | null;
  client_ip: string | null;
  user_agent: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  utm_source: string | null;
  utm_medium: string | null;
}

const NOT_FOUND: MetaMatchResponse = {
  found: false,
  email: null,
  phone: null,
  fbclid: null,
  fbclid_timestamp: null,
  optin_timestamp: null,
  fbp: null,
  fbc: null,
  client_ip: null,
  user_agent: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  utm_source: null,
  utm_medium: null,
};

export function buildMetaMatchResponse(rec: MetaMatchRecord | null): MetaMatchResponse {
  if (!rec) return { ...NOT_FOUND };
  const a = (rec.attribution && typeof rec.attribution === "object" ? rec.attribution : {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    found: true,
    email: rec.leadEmail ?? null,
    phone: rec.leadMobile ?? null,
    fbclid: str(a.fbclid),
    fbclid_timestamp: rec.fbclidTimestamp ?? null,
    optin_timestamp: rec.startedAt ? Math.floor(rec.startedAt.getTime() / 1000) : null,
    fbp: rec.fbp ?? null,
    fbc: rec.fbc ?? null,
    client_ip: rec.clientIp ?? null,
    user_agent: rec.userAgent ?? null,
    utm_campaign: str(a.utm_campaign),
    utm_content: str(a.utm_content),
    utm_term: str(a.utm_term),
    utm_source: str(a.utm_source),
    utm_medium: str(a.utm_medium),
  };
}
