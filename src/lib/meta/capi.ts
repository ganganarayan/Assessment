import { hashEmail, hashPhone, hashName } from "@/lib/meta/hash";

/**
 * Pure builder for a single Meta Conversions API (server-side) event. No env, no
 * network — so it is fully unit-testable. The network sender lives in send.ts.
 *
 * Dedup contract: pass the SAME `eventId` here and as the browser pixel's
 * `{ eventID }` for the SAME `eventName`, and Meta merges the two into one event
 * (48h window) — so an ad-blocker dropping the browser pixel never loses the
 * conversion, and a delivered browser pixel is not double-counted.
 */

/** Raw (un-hashed) match signals. PII is hashed in buildCapiEvent; the request
 *  context fields (ip/ua/fbp/fbc) are sent as-is per Meta's spec. */
export interface CapiUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

export interface CapiEventInput {
  /** Standard ("CompleteRegistration") or custom ("AssessmentCompleted") name. */
  eventName: string;
  /** Dedup key shared with the browser pixel's eventID. */
  eventId: string;
  /** Wall-clock ms at the call site (kept as a param so this stays pure). */
  eventTimeMs: number;
  eventSourceUrl?: string | null;
  user: CapiUserData;
  customData?: Record<string, string | number> | null;
}

/** Meta `user_data`: hashed PII as arrays + plaintext request-context signals. */
export interface CapiUserDataPayload {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbp?: string;
  fbc?: string;
}

export interface CapiEventPayload {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: CapiUserDataPayload;
  custom_data?: Record<string, string | number>;
}

function buildUserData(u: CapiUserData): CapiUserDataPayload {
  const out: CapiUserDataPayload = {};
  const em = hashEmail(u.email);
  const ph = hashPhone(u.phone);
  const fn = hashName(u.firstName);
  const ln = hashName(u.lastName);
  if (em) out.em = [em];
  if (ph) out.ph = [ph];
  if (fn) out.fn = [fn];
  if (ln) out.ln = [ln];
  if (u.clientIpAddress) out.client_ip_address = u.clientIpAddress;
  if (u.clientUserAgent) out.client_user_agent = u.clientUserAgent;
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  return out;
}

/* ------------------------------------------------------------ config ---- */

export const DEFAULT_GRAPH_API_VERSION = "v21.0";

export interface CapiConfig {
  accessToken: string;
  datasetId: string;
  version: string;
  testEventCode: string | null;
}

/**
 * Pure config resolution (no env import) so the "inert until configured" rule is
 * unit-testable. Returns null when CAPI must be a no-op: the access token OR the
 * dataset id is missing. The dataset id falls back to the public pixel id (they
 * are the same value).
 */
export function resolveCapiConfig(raw: {
  accessToken?: string | null;
  datasetId?: string | null;
  pixelId?: string | null;
  version?: string | null;
  testEventCode?: string | null;
}): CapiConfig | null {
  const accessToken = raw.accessToken ?? null;
  const datasetId = raw.datasetId ?? raw.pixelId ?? null;
  if (!accessToken || !datasetId) return null;
  return {
    accessToken,
    datasetId,
    version: raw.version ?? DEFAULT_GRAPH_API_VERSION,
    testEventCode: raw.testEventCode ?? null,
  };
}

/**
 * Build Meta's `fbc` click id from the `fbclid` captured on the ad-click landing.
 * Format: fb.1.<creationTimeMs>.<fbclid>. This is what lets Meta ATTRIBUTE a
 * server-side conversion to the ad click (email/phone alone gets the event
 * received but not attributed). Returns null when there's no fbclid (organic).
 */
export function fbcFromFbclid(fbclid: string | null | undefined, creationTimeMs: number): string | null {
  if (!fbclid || typeof fbclid !== "string") return null;
  return `fb.1.${Math.floor(creationTimeMs)}.${fbclid}`;
}

/**
 * Extract the REAL creation time (as unix MILLISECONDS) from a browser `_fbc`
 * cookie `fb.1.<creationTimeMs>.<fbclid>`. This is the authoritative fbclid
 * timestamp when the pixel wrote _fbc. Returns null when absent/malformed (then
 * the caller falls back to the opt-in time). Milliseconds — same unit as Meta's
 * fbc format and the fbclidTimestamp column, so nothing needs converting.
 */
export function fbcCreationMs(fbc: string | null | undefined): number | null {
  if (!fbc || typeof fbc !== "string") return null;
  const parts = fbc.split(".");
  if (parts.length < 4) return null;
  const ms = Number(parts[2]);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.floor(ms);
}

export function buildCapiEvent(input: CapiEventInput): CapiEventPayload {
  const payload: CapiEventPayload = {
    event_name: input.eventName,
    event_time: Math.floor(input.eventTimeMs / 1000),
    event_id: input.eventId,
    action_source: "website",
    user_data: buildUserData(input.user),
  };
  if (input.eventSourceUrl) payload.event_source_url = input.eventSourceUrl;
  if (input.customData && Object.keys(input.customData).length > 0) {
    payload.custom_data = input.customData;
  }
  return payload;
}
