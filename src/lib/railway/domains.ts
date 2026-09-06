import "server-only";

/**
 * Railway Public API client for CUSTOM DOMAIN provisioning.
 *
 * A tenant custom domain only gets a valid TLS cert once it's REGISTERED on the
 * Railway service — otherwise Railway serves its `*.up.railway.app` wildcard and the
 * browser rejects it. This registers/deregisters the domain via Railway's GraphQL API
 * so Railway issues a Let's Encrypt cert automatically and hands back the CNAME target
 * the tenant must point DNS at.
 *
 * Config (all from the runtime env):
 *  - RAILWAY_API_TOKEN      — a Railway account/workspace token (user-provided secret)
 *  - RAILWAY_PROJECT_ID     — auto-injected by Railway at runtime
 *  - RAILWAY_ENVIRONMENT_ID — auto-injected (differs per env, so prod domains land on
 *                             the prod service and staging on staging automatically)
 *  - RAILWAY_SERVICE_ID     — auto-injected
 *
 * When the token isn't set the caller falls back to manual behaviour (no throw).
 */

const ENDPOINT = "https://backboard.railway.com/graphql/v2";
const TIMEOUT_MS = 15_000;

interface RailwayEnv {
  token: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
}

function railwayEnv(): RailwayEnv | null {
  const token = process.env.RAILWAY_API_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
  const serviceId = process.env.RAILWAY_SERVICE_ID;
  if (!token || !projectId || !environmentId || !serviceId) return null;
  return { token, projectId, environmentId, serviceId };
}

/** TRUE when Railway auto-provisioning is available (token + injected IDs present). */
export function railwayConfigured(): boolean {
  return railwayEnv() !== null;
}

interface DnsRecord {
  hostlabel?: string | null;
  fqdn?: string | null;
  recordType?: string | null;
  requiredValue?: string | null;
  currentValue?: string | null;
  status?: string | null;
  purpose?: string | null;
  zone?: string | null;
}
interface CustomDomainStatus {
  dnsRecords?: DnsRecord[] | null;
  certificateStatus?: string | null;
}
interface CustomDomain {
  id: string;
  domain: string;
  status?: CustomDomainStatus | null;
}

/** One DNS record the domain owner must add at their provider, normalized for display. */
export interface RailwayDnsRecord {
  type: string; // CNAME / A / TXT …
  name: string; // the host the record goes on (fqdn), e.g. assess.yourbrand.com
  value: string; // the value to set (Railway's requiredValue)
  purpose: string | null; // e.g. "routing" / "certificate" (when Railway says)
  status: string | null; // per-record status when Railway reports it
}

export interface RailwayDomainResult {
  id: string;
  /** CNAME value the tenant must point their host at (from dnsRecords.requiredValue). */
  dnsTarget: string | null;
  /** Railway certificate status, e.g. "ISSUED" / "ISSUING" / "WAITING". */
  certStatus: string | null;
  /** Every DNS record Railway needs the owner to add (CNAME + any verification). */
  dnsRecords: RailwayDnsRecord[];
}

async function gql<T>(env: RailwayEnv, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: { data?: T; errors?: { message: string }[] } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Railway API returned non-JSON (status ${res.status})`);
  }
  if (json?.errors?.length) throw new Error(`Railway API: ${json.errors.map((e) => e.message).join("; ")}`);
  if (!res.ok || !json?.data) throw new Error(`Railway API error (status ${res.status})`);
  return json.data;
}

const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\.$/, "");

function pickResult(cd: CustomDomain | null | undefined): RailwayDomainResult | null {
  if (!cd) return null;
  const raw = cd.status?.dnsRecords ?? [];
  const dnsRecords: RailwayDnsRecord[] = raw
    .filter((r) => clean(r.requiredValue).length > 0)
    .map((r) => ({
      type: (r.recordType ?? "CNAME").toUpperCase(),
      name: clean(r.fqdn ?? r.hostlabel ?? cd.domain),
      value: clean(r.requiredValue),
      purpose: r.purpose ?? null,
      status: r.status ?? null,
    }));
  // Prefer the CNAME/A routing record for the single dnsTarget summary.
  const primary = dnsRecords.find((r) => r.type === "CNAME" || r.type === "A") ?? dnsRecords[0];
  return {
    id: cd.id,
    dnsTarget: primary?.value ?? null,
    certStatus: cd.status?.certificateStatus ?? null,
    dnsRecords,
  };
}

/** Register the host with Railway so it provisions a TLS cert. Idempotent-ish: if the
 *  domain already exists Railway errors — the caller treats that as already-provisioned. */
export async function railwayCreateCustomDomain(domain: string): Promise<RailwayDomainResult | null> {
  const env = railwayEnv();
  if (!env) return null;
  const data = await gql<{ customDomainCreate: CustomDomain }>(
    env,
    `mutation($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id domain
        status { certificateStatus dnsRecords { hostlabel fqdn recordType requiredValue currentValue status purpose zone } }
      }
    }`,
    { input: { domain, projectId: env.projectId, environmentId: env.environmentId, serviceId: env.serviceId } },
  );
  return pickResult(data.customDomainCreate);
}

/** Poll a Railway custom domain's status (cert + DNS). */
export async function railwayCustomDomainStatus(railwayDomainId: string): Promise<RailwayDomainResult | null> {
  const env = railwayEnv();
  if (!env) return null;
  const data = await gql<{ customDomain: CustomDomain | null }>(
    env,
    `query($id: String!, $projectId: String!) {
      customDomain(id: $id, projectId: $projectId) {
        id domain
        status { certificateStatus dnsRecords { hostlabel fqdn recordType requiredValue currentValue status purpose zone } }
      }
    }`,
    { id: railwayDomainId, projectId: env.projectId },
  );
  return pickResult(data.customDomain);
}

/** Deregister the host from Railway (on domain removal). Never throws to the caller —
 *  a failed cleanup shouldn't block deleting our own row. */
export async function railwayDeleteCustomDomain(railwayDomainId: string): Promise<void> {
  const env = railwayEnv();
  if (!env) return;
  await gql<{ customDomainDelete: boolean }>(
    env,
    `mutation($id: String!) { customDomainDelete(id: $id) }`,
    { id: railwayDomainId },
  ).catch(() => {});
}

/** A Railway certificate status that means HTTPS is live. */
export function certIsLive(certStatus: string | null | undefined): boolean {
  return /issued|active|deployed|ready/i.test(certStatus ?? "");
}
