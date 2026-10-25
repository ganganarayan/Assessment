import "server-only";

/**
 * The four Meta Graph calls that one-click WhatsApp onboarding needs, and nothing else.
 *
 * Deliberately NOT a general Graph wrapper. Each function here is one documented step
 * of Embedded Signup onboarding, named after what it is for, so the order in
 * `completeWhatsAppConnect` reads as the procedure Meta publishes.
 *
 * 🔴 The step that is NOT here is POST /{phone-number-id}/register. A normal Cloud API
 * onboarding ends with it. Coexistence must not: registering moves the number onto the
 * Cloud API alone and takes it off the WhatsApp Business app on the owner's phone,
 * which is the one thing the whole feature exists to avoid. There is no flag for this
 * and no undo, so the call is absent rather than guarded.
 */

const GRAPH = "https://graph.facebook.com";

export interface GraphFailure {
  ok: false;
  /** Already human-readable: Meta's own message when it sent one. */
  error: string;
}
type GraphResult<T> = ({ ok: true } & T) | GraphFailure;

interface MetaErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
}

/**
 * One Graph request, with Meta's error body turned into a sentence.
 *
 * Every failure here ends up in front of a non-technical business owner, so the
 * message keeps Meta's own wording (it is usually specific and actionable, e.g. "the
 * code has expired") and appends the trace id, which is the only thing Meta support
 * will ask for.
 */
async function graph<T>(
  path: string,
  init: RequestInit & { token?: string },
): Promise<GraphResult<{ data: T }>> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${path}`, {
      ...rest,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    // A network failure mid-onboarding is the worst case: the code may already be
    // spent. Say so plainly rather than "something went wrong".
    return { ok: false, error: `Could not reach Meta (${e instanceof Error ? e.message : String(e)}).` };
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = (body as MetaErrorBody | null)?.error;
    const trace = err?.fbtrace_id ? ` (Meta trace ${err.fbtrace_id})` : "";
    const msg = err?.message?.trim() || `Meta returned HTTP ${res.status}.`;
    return { ok: false, error: `${msg}${trace}` };
  }
  return { ok: true, data: (body ?? {}) as T };
}

/**
 * Step 1: swap the Embedded Signup code for the customer's business token.
 *
 * 🔴 The code lives for about 30 seconds, so this runs on the first server hop after
 * the popup closes - never behind a confirmation screen. What comes back is a business
 * integration system user access token, which does not expire, and is the token every
 * later call and every message send uses. No System user is created in anybody's
 * Business settings, which is precisely why this path needs no second admin's approval.
 */
export async function exchangeCodeForBusinessToken(args: {
  appId: string;
  appSecret: string;
  code: string;
  version: string;
}): Promise<GraphResult<{ token: string }>> {
  const qs = new URLSearchParams({
    client_id: args.appId,
    client_secret: args.appSecret,
    code: args.code,
  });
  const r = await graph<{ access_token?: string }>(`${args.version}/oauth/access_token?${qs}`, {
    method: "GET",
  });
  if (!r.ok) return r;
  const token = r.data.access_token?.trim();
  if (!token) return { ok: false, error: "Meta accepted the code but returned no access token." };
  return { ok: true, token };
}

export interface WabaPhoneNumber {
  id: string;
  displayPhone: string;
  verifiedName: string;
  /** True when this number is ALSO live in the WhatsApp Business app - coexistence. */
  isOnBizApp: boolean;
  /** Meta's own word for the stack serving it, e.g. "CLOUD_API". */
  platformType: string;
}

const PHONE_FIELDS = "id,display_phone_number,verified_name,is_on_biz_app,platform_type";

interface RawPhone {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  is_on_biz_app?: boolean;
  platform_type?: string;
}

function readPhone(raw: RawPhone): WabaPhoneNumber {
  return {
    id: raw.id ?? "",
    displayPhone: raw.display_phone_number ?? "",
    verifiedName: raw.verified_name ?? "",
    isOnBizApp: raw.is_on_biz_app === true,
    platformType: raw.platform_type ?? "",
  };
}

/** Step 2: read the number, which is also how coexistence is CONFIRMED rather than
 *  assumed - Meta reports is_on_biz_app and platform_type, and we store both. */
export async function getPhoneNumber(args: {
  phoneNumberId: string;
  token: string;
  version: string;
}): Promise<GraphResult<{ phone: WabaPhoneNumber }>> {
  const r = await graph<RawPhone>(`${args.version}/${args.phoneNumberId}?fields=${PHONE_FIELDS}`, {
    method: "GET",
    token: args.token,
  });
  if (!r.ok) return r;
  return { ok: true, phone: readPhone(r.data) };
}

/**
 * Step 2a: the numbers on a WABA.
 *
 * Needed because the coexistence finish event can arrive WITHOUT a phone number id -
 * Meta documents the business-app onboarding event as carrying waba_id only. Rather
 * than fail, the flow asks the WABA what it has; a single number is taken, and more
 * than one is reported instead of guessed at.
 */
export async function listWabaPhoneNumbers(args: {
  wabaId: string;
  token: string;
  version: string;
}): Promise<GraphResult<{ phones: WabaPhoneNumber[] }>> {
  const r = await graph<{ data?: RawPhone[] }>(
    `${args.version}/${args.wabaId}/phone_numbers?fields=${PHONE_FIELDS}`,
    { method: "GET", token: args.token },
  );
  if (!r.ok) return r;
  return { ok: true, phones: (r.data.data ?? []).map(readPhone) };
}

/**
 * Step 3: subscribe our app to the customer's WABA.
 *
 * Without this the WABA sends us nothing, and for coexistence Meta requires the
 * subscription (history, smb_app_state_sync, smb_message_echoes are configured on the
 * app itself, not per call). Sending a template would still work, so this failing is
 * reported but does not throw away a token we have already stored.
 */
export async function subscribeAppToWaba(args: {
  wabaId: string;
  token: string;
  version: string;
}): Promise<{ ok: true } | GraphFailure> {
  const r = await graph<{ success?: boolean }>(`${args.version}/${args.wabaId}/subscribed_apps`, {
    method: "POST",
    token: args.token,
  });
  if (!r.ok) return r;
  return { ok: true };
}

/**
 * Which pile of the owner's own data to ask for.
 *
 * Meta's names, kept rather than prettified, because these strings go on the wire and
 * a rename here would be a silent wrong-sync. "smb_app_state_sync" is the contacts in
 * their phone's address book; "history" is up to six months of their 1:1 chats.
 */
export type SmbSyncType = "smb_app_state_sync" | "history";

/**
 * Step 4, coexistence only: ask the phone to send its contacts or its past chats.
 *
 * 🔴 ONCE EACH, and inside roughly 24 hours of onboarding. Meta refuses a second
 * request, and after the window the business has to offboard and redo the whole flow
 * to get another chance. So this is never called speculatively, never retried on a
 * refusal, and never called to "check" anything.
 *
 * Nothing useful comes back in the response. Success means Meta accepted the request;
 * the data arrives afterwards over the webhook, in chunks, and only if the business
 * agreed to share it on their phone - they may well have declined after we asked,
 * which arrives as an error inside the history webhook rather than here.
 */
export async function startSmbSync(args: {
  phoneNumberId: string;
  token: string;
  version: string;
  syncType: SmbSyncType;
}): Promise<{ ok: true } | GraphFailure> {
  const r = await graph<{ success?: boolean }>(`${args.version}/${args.phoneNumberId}/smb_app_data`, {
    method: "POST",
    token: args.token,
    body: JSON.stringify({ messaging_product: "whatsapp", sync_type: args.syncType }),
  });
  if (!r.ok) return r;
  return { ok: true };
}

/**
 * Undo step 3, so a disconnected WABA stops sending us webhooks.
 *
 * Best-effort by design: the local row is cleared whether or not Meta agrees, because
 * "Disconnect" has to mean the credential is gone from our side even when the token
 * has already been revoked at Meta's end and every call with it fails.
 */
export async function unsubscribeAppFromWaba(args: {
  wabaId: string;
  token: string;
  version: string;
}): Promise<{ ok: true } | GraphFailure> {
  const r = await graph<{ success?: boolean }>(`${args.version}/${args.wabaId}/subscribed_apps`, {
    method: "DELETE",
    token: args.token,
  });
  if (!r.ok) return r;
  return { ok: true };
}
