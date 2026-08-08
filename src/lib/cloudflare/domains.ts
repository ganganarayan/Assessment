import "server-only";

/**
 * Cloudflare API client for CUSTOM DOMAIN provisioning.
 *
 * All tenant domains live on the platform owner's Cloudflare account, so the app can
 * fully automate them: on "Add domain" it creates a PROXIED CNAME in the domain's
 * zone pointing at THIS app's host and sets the zone's SSL mode to Full. Cloudflare
 * then serves a valid edge certificate (Universal SSL) for the host and proxies to
 * Railway — no `up.railway.app` target is ever exposed to the tenant.
 *
 * Routing still needs the host registered on Railway (Railway routes by Host); that
 * is handled separately by lib/railway/domains. Cloudflare = TLS + DNS; Railway = routing.
 *
 * Config: CLOUDFLARE_API_TOKEN (user-provided; Zone:Read + DNS:Edit + SSL:Edit).
 * Absent token => cloudflareConfigured() false and the caller falls back.
 */

const API = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 15_000;

function token(): string | null {
  return process.env.CLOUDFLARE_API_TOKEN || null;
}

export function cloudflareConfigured(): boolean {
  return !!token();
}

interface CfResponse<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

async function cf<T>(method: string, path: string, body?: unknown): Promise<T> {
  const t = token();
  if (!t) throw new Error("Cloudflare API token not configured.");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
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

interface Zone { id: string; name: string }
interface DnsRecord { id: string; name: string; type: string; content: string; proxied?: boolean }

/** Find the zone that owns a hostname (longest matching zone name in the account). */
async function findZoneId(hostname: string): Promise<string | null> {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  const zones = await cf<Zone[]>("GET", `/zones?per_page=50&status=active`);
  const match = zones
    .map((z) => ({ id: z.id, name: z.name.toLowerCase() }))
    .filter((z) => h === z.name || h.endsWith(`.${z.name}`))
    .sort((a, b) => b.name.length - a.name.length)[0];
  return match?.id ?? null;
}

export interface CloudflareProvisionResult {
  ok: boolean;
  /** What the tenant's CNAME now points at (the app host) — informational. */
  target: string;
  error?: string;
}

/**
 * Provision a host: create/refresh a PROXIED CNAME (host -> origin) in its zone and
 * set the zone's SSL mode to Full so Cloudflare↔Railway works. Idempotent.
 */
export async function cloudflareProvisionDomain(hostname: string, origin: string): Promise<CloudflareProvisionResult> {
  if (!cloudflareConfigured()) return { ok: false, target: origin, error: "Cloudflare not configured." };
  const zoneId = await findZoneId(hostname);
  if (!zoneId) return { ok: false, target: origin, error: `No Cloudflare zone found for ${hostname}. Add the domain to Cloudflare first.` };

  const existing = await cf<DnsRecord[]>("GET", `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`);
  const record = { type: "CNAME", name: hostname, content: origin, proxied: true, ttl: 1 };
  const current = existing[0];
  if (current) {
    await cf("PUT", `/zones/${zoneId}/dns_records/${current.id}`, record);
  } else {
    await cf("POST", `/zones/${zoneId}/dns_records`, record);
  }

  // Ensure Cloudflare↔origin isn't "Flexible" (which loops against Railway's HTTPS).
  // Best-effort: a token without SSL:Edit still gets working DNS + Universal SSL.
  await cf("PATCH", `/zones/${zoneId}/settings/ssl`, { value: "full" }).catch(() => {});

  return { ok: true, target: origin };
}

/** Remove the proxied CNAME for a host (on domain deletion). Never throws. */
export async function cloudflareDeprovisionDomain(hostname: string): Promise<void> {
  if (!cloudflareConfigured()) return;
  try {
    const zoneId = await findZoneId(hostname);
    if (!zoneId) return;
    const existing = await cf<DnsRecord[]>("GET", `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`);
    for (const r of existing) {
      if (r.type === "CNAME") await cf("DELETE", `/zones/${zoneId}/dns_records/${r.id}`).catch(() => {});
    }
  } catch {
    /* best-effort cleanup */
  }
}
