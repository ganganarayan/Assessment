import "server-only";

/**
 * Cloudflare for SaaS — CUSTOM HOSTNAMES.
 *
 * WHY THIS EXISTS, AND HOW IT DIFFERS FROM cloudflare/domains.ts
 * The older module provisions a domain that lives in the OWNER's own Cloudflare
 * account: it finds the zone and writes a proxied CNAME. That works for domains you
 * control and does nothing for a customer's own domain, whose zone is in their
 * account — `findZoneId` returns null and the caller silently falls back to Railway.
 *
 * Railway is the real constraint: it caps custom domains per service by plan, and
 * every tenant domain consumes one slot. "Every tenant brings their own domain" then
 * has a hard ceiling that no amount of code can raise.
 *
 * Cloudflare for SaaS inverts it. A customer hostname is registered against OUR zone,
 * Cloudflare issues and renews its certificate, and the customer points one CNAME at
 * our fallback origin. Railway never learns about the host at all, so no slot is used
 * and the ceiling becomes Cloudflare's (100 included, then cents per hostname).
 *
 * THE HOST-HEADER PROBLEM — why a Worker is part of this
 * Railway routes by Host. Cloudflare forwards the customer's hostname intact, which
 * Railway would not recognise, so a request would 404 before reaching the app. The
 * Worker in infra/cloudflare-worker.js rewrites the request to a host Railway DOES
 * route and carries the original hostname in a header, with a shared secret proving
 * the header came from us. See lib/tenant/forwarded-host.ts for the receiving half —
 * that secret is what stops anyone from claiming to be any tenant.
 *
 * Config (all optional; absent = this path is simply off and the caller falls back):
 *  - CLOUDFLARE_API_TOKEN        same token the DNS module uses, plus SSL:Edit
 *  - CLOUDFLARE_SAAS_ZONE_ID     the zone custom hostnames are registered against
 *  - CLOUDFLARE_SAAS_FALLBACK    the CNAME target customers point at
 */

const API = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 15_000;

export interface SaasConfig {
  token: string;
  zoneId: string;
  fallbackOrigin: string;
}

function saasConfig(): SaasConfig | null {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_SAAS_ZONE_ID;
  const fallbackOrigin = process.env.CLOUDFLARE_SAAS_FALLBACK;
  if (!token || !zoneId || !fallbackOrigin) return null;
  return { token, zoneId, fallbackOrigin: fallbackOrigin.trim().toLowerCase().replace(/\.$/, "") };
}

/** TRUE when Cloudflare for SaaS is configured and should own custom hostnames. */
export function cloudflareSaasConfigured(): boolean {
  return saasConfig() !== null;
}

/** The CNAME target a customer points their host at. Null when not configured. */
export function cloudflareSaasFallbackOrigin(): string | null {
  return saasConfig()?.fallbackOrigin ?? null;
}

interface CfResponse<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

async function cf<T>(cfg: SaasConfig, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: CfResponse<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as CfResponse<T>) : null;
  } catch {
    throw new Error(`Cloudflare returned non-JSON (status ${res.status})`);
  }
  if (!json?.success) {
    throw new Error(`Cloudflare API: ${json?.errors?.map((e) => e.message).join("; ") || `status ${res.status}`}`);
  }
  return json.result;
}

/** A DNS record the customer must add, normalized to the shape the UI already renders. */
export interface SaasDnsRecord {
  type: string;
  name: string;
  value: string;
  purpose: string | null;
  status: string | null;
}

export interface SaasHostnameResult {
  id: string;
  /** Cloudflare's certificate status: pending_validation / active / … */
  sslStatus: string | null;
  /** Overall custom-hostname status: pending / active / … */
  status: string | null;
  /** Records the customer adds: the routing CNAME plus any validation record. */
  dnsRecords: SaasDnsRecord[];
}

interface CustomHostname {
  id: string;
  hostname: string;
  status?: string | null;
  ssl?: {
    status?: string | null;
    validation_records?: { txt_name?: string | null; txt_value?: string | null; http_url?: string | null }[] | null;
  } | null;
  ownership_verification?: { type?: string | null; name?: string | null; value?: string | null } | null;
}

/** "assess.acme.com" -> "assess" — what a DNS provider's Name field wants. */
function labelOf(host: string): string {
  const parts = host.split(".").filter(Boolean);
  return parts.length <= 2 ? "@" : parts.slice(0, parts.length - 2).join(".");
}

function shape(cfg: SaasConfig, ch: CustomHostname): SaasHostnameResult {
  const records: SaasDnsRecord[] = [
    // The one record that actually routes traffic.
    {
      type: "CNAME",
      name: labelOf(ch.hostname),
      value: cfg.fallbackOrigin,
      purpose: "routing",
      status: ch.status ?? null,
    },
  ];

  // TXT validation, when Cloudflare asks for it (DCV by TXT rather than HTTP).
  for (const v of ch.ssl?.validation_records ?? []) {
    if (v?.txt_name && v?.txt_value) {
      records.push({
        type: "TXT",
        name: v.txt_name.replace(/\.$/, ""),
        value: v.txt_value,
        purpose: "certificate",
        status: ch.ssl?.status ?? null,
      });
    }
  }

  // Ownership verification, when the zone requires pre-validation.
  const ov = ch.ownership_verification;
  if (ov?.name && ov?.value) {
    records.push({
      type: (ov.type || "TXT").toUpperCase(),
      name: ov.name.replace(/\.$/, ""),
      value: ov.value,
      purpose: "ownership",
      status: ch.status ?? null,
    });
  }

  return {
    id: ch.id,
    sslStatus: ch.ssl?.status ?? null,
    status: ch.status ?? null,
    dnsRecords: records,
  };
}

/**
 * Register a customer hostname. Idempotent in practice: Cloudflare rejects a duplicate,
 * so an existing one is looked up and returned instead of failing the caller.
 */
export async function cloudflareCreateCustomHostname(hostname: string): Promise<SaasHostnameResult | null> {
  const cfg = saasConfig();
  if (!cfg) return null;
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  try {
    const ch = await cf<CustomHostname>(cfg, "POST", `/zones/${cfg.zoneId}/custom_hostnames`, {
      hostname: host,
      // HTTP DCV: Cloudflare validates over the hostname itself once the CNAME
      // resolves, so the customer adds ONE record and nothing else.
      ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
    });
    return shape(cfg, ch);
  } catch (e) {
    // Already registered (ours, from an earlier attempt) — read it back rather than
    // surfacing a duplicate error the operator can do nothing with.
    const existing = await cloudflareFindCustomHostname(host);
    if (existing) return existing;
    throw e;
  }
}

/** Look a hostname up by name. Null when absent (or not configured). */
export async function cloudflareFindCustomHostname(hostname: string): Promise<SaasHostnameResult | null> {
  const cfg = saasConfig();
  if (!cfg) return null;
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  const list = await cf<CustomHostname[]>(
    cfg,
    "GET",
    `/zones/${cfg.zoneId}/custom_hostnames?hostname=${encodeURIComponent(host)}&per_page=5`,
  );
  const found = list.find((c) => (c.hostname ?? "").toLowerCase() === host);
  return found ? shape(cfg, found) : null;
}

/** Current status for a registered hostname id. */
export async function cloudflareCustomHostnameStatus(id: string): Promise<SaasHostnameResult | null> {
  const cfg = saasConfig();
  if (!cfg) return null;
  const ch = await cf<CustomHostname>(cfg, "GET", `/zones/${cfg.zoneId}/custom_hostnames/${id}`);
  return shape(cfg, ch);
}

/** Remove a custom hostname. Never throws — a failed cleanup must not block deletion. */
export async function cloudflareDeleteCustomHostname(id: string): Promise<void> {
  const cfg = saasConfig();
  if (!cfg) return;
  await cf(cfg, "DELETE", `/zones/${cfg.zoneId}/custom_hostnames/${id}`).catch(() => {});
}

/** Cloudflare SSL status meaning HTTPS is live for the hostname. */
export function saasCertIsLive(sslStatus: string | null | undefined, status?: string | null): boolean {
  const s = `${sslStatus ?? ""} ${status ?? ""}`.toLowerCase();
  if (/pending|initializing|deleted|blocked|error|moved/.test(s)) return false;
  return /active/.test(s);
}
