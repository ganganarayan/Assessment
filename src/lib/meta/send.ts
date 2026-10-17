import { env } from "@/lib/env";
import { buildCapiEvent, resolveCapiConfig, type CapiEventInput } from "@/lib/meta/capi";
import { resolveMetaConfig, resolvePlatformMetaConfig } from "@/lib/settings/config";

/**
 * Network sender for Meta Conversions API. Imports env (so it is NOT imported by
 * the pure verify harness). Fully fail-soft: a missing token makes it a no-op,
 * and any HTTP/network error is logged and swallowed - it must never break the
 * submission flow. The inert/config decision lives in the pure resolveCapiConfig.
 */

const TIMEOUT_MS = 4_000;

/**
 * Guarantee `event_source_url` on EVERY event. Meta blocks website events without
 * it (for restricted ad categories), so this is the single choke point: any caller
 * that passes an empty/whitespace/missing URL gets the app URL as a safe fallback.
 */
function withSourceUrl(input: CapiEventInput): CapiEventInput {
  const src = input.eventSourceUrl?.trim();
  return { ...input, eventSourceUrl: src && src.length > 0 ? src : env.NEXT_PUBLIC_APP_URL };
}

/**
 * Resolve the CAPI config for a SCOPE from Settings. Token/pixel/dataset come from the
 * tenant's ad account; version + test code stay global (env).
 *
 * 🔴 `adAccountId` IS NOT OPTIONAL, anywhere in this file, and that is the whole point.
 * `resolveMetaConfig` has accepted a per-assessment ad account since the model landed,
 * and because the parameter was optional not one caller ever passed it - so the column
 * existed, the resolver supported it, and every event in the app still went to the
 * tenant's default pixel. An optional argument on a hot path is a feature nobody uses
 * and nobody notices is unused. Required, the compiler asks every call site which
 * account this event belongs to, and `null` becomes a deliberate answer ("the tenant's
 * default") rather than an oversight.
 */
async function getConfig(tenantId: string | null, adAccountId: string | null) {
  const m = await resolveMetaConfig(tenantId, adAccountId);
  return resolveCapiConfig({
    accessToken: m.capiToken,
    datasetId: m.datasetId,
    pixelId: m.pixelId,
    version: env.META_GRAPH_API_VERSION,
    testEventCode: env.META_CAPI_TEST_EVENT_CODE,
  });
}

/** True when a token + dataset are configured for this scope (CAPI will send). */
export async function isCapiConfigured(tenantId: string | null, adAccountId: string | null): Promise<boolean> {
  return (await getConfig(tenantId, adAccountId)) !== null;
}

/**
 * Diagnostic: send a real `AssessmentCompleted` event server-side and return
 * Meta's ACTUAL response (events_received / error). This is the source of truth
 * for "is the app's event reaching Meta" - unlike sendCapiEvent it surfaces the
 * status + body instead of swallowing.
 */
export async function testCapi(testEventCode: string | undefined, eventNameInput: string | undefined, tenantId: string | null, adAccountId: string | null): Promise<{
  ok: boolean;
  eventName: string;
  datasetId?: string;
  status?: number;
  response?: string;
  error?: string;
}> {
  const eventName = (eventNameInput && eventNameInput.trim()) || "AssessmentCompleted";
  const cfg = await getConfig(tenantId, adAccountId);
  if (!cfg) {
    return {
      ok: false,
      eventName,
      error:
        "No Meta pixel id + Conversions API token for this scope, so nothing is sent to Meta. Set them in Settings - the platform in super-admin Settings, a tenant in their own. Environment variables are no longer read.",
    };
  }
  // A test code (entered for this send, or the env default) routes the event to
  // the Events Manager → Test Events tab so you can watch it arrive in seconds.
  const code = (testEventCode && testEventCode.trim()) || cfg.testEventCode;
  const body = JSON.stringify({
    data: [
      buildCapiEvent({
        eventName,
        eventId: `capitest-${Math.floor(Date.now() / 1000)}`,
        eventTimeMs: Date.now(),
        eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/a/diagnostic`,
        user: { email: "capi-test@assess360.local" },
        // value + currency so a Purchase-style custom event (e.g. Purchase121) is realistic.
        customData: { content_name: eventName, value: 1, currency: "INR" },
      }),
    ],
    ...(code ? { test_event_code: code } : {}),
  });
  const url = `https://graph.facebook.com/${cfg.version}/${cfg.datasetId}/events?access_token=${encodeURIComponent(cfg.accessToken)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    return {
      ok: res.ok,
      eventName,
      datasetId: cfg.datasetId,
      status: res.status,
      response: (await res.text()).slice(0, 800),
    };
  } catch (e) {
    return {
      ok: false,
      eventName,
      datasetId: cfg.datasetId,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Like sendCapiEvent but RETURNS Meta's real response (status + body) and never
 * applies a test code - for the admin "re-send a real purchase" recovery tool, so
 * the operator can see the conversion was accepted (events_received: 1).
 */
export async function sendCapiEventVerbose(input: CapiEventInput, tenantId: string | null, adAccountId: string | null): Promise<{
  ok: boolean;
  status?: number;
  response?: string;
  error?: string;
}> {
  // An owner previewing their own funnel. Everything else about the run is real;
  // this is the single thing that must not reach Meta. See CapiEventInput.preview.
  if (input.preview) return { ok: true, response: "skipped: preview" };
  const cfg = await getConfig(tenantId, adAccountId);
  if (!cfg) {
    return { ok: false, error: "No Meta pixel id + Conversions API token for this scope. Set them in Settings; environment variables are no longer read." };
  }
  const body = JSON.stringify({ data: [buildCapiEvent(withSourceUrl(input))] }); // real conversion - no test code
  const url = `https://graph.facebook.com/${cfg.version}/${cfg.datasetId}/events?access_token=${encodeURIComponent(cfg.accessToken)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    return { ok: res.ok, status: res.status, response: (await res.text()).slice(0, 800) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Send a CAPI event on the PLATFORM/app SUBSCRIPTION pixel (Assess360 SaaS funnel) -
 * a separate pixel + token from the Gita assessment one. Returns Meta's real response.
 * Inert (ok:false) until the super admin configures the platform pixel in Settings.
 * Never throws.
 */
export async function sendPlatformCapiEvent(input: CapiEventInput): Promise<{
  ok: boolean;
  status?: number;
  response?: string;
  error?: string;
}> {
  // An owner previewing their own funnel. Everything else about the run is real;
  // this is the single thing that must not reach Meta. See CapiEventInput.preview.
  if (input.preview) return { ok: true, response: "skipped: preview" };
  const m = await resolvePlatformMetaConfig();
  const cfg = resolveCapiConfig({
    accessToken: m.capiToken,
    datasetId: m.pixelId,
    pixelId: m.pixelId,
    version: env.META_GRAPH_API_VERSION,
    testEventCode: env.META_CAPI_TEST_EVENT_CODE,
  });
  if (!cfg) return { ok: false, error: "Platform pixel / CAPI token not configured in Settings." };
  const body = JSON.stringify({ data: [buildCapiEvent(withSourceUrl(input))] });
  const url = `https://graph.facebook.com/${cfg.version}/${cfg.datasetId}/events?access_token=${encodeURIComponent(cfg.accessToken)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    return { ok: res.ok, status: res.status, response: (await res.text()).slice(0, 800) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** True when the platform SaaS pixel + CAPI token are configured. */
export async function isPlatformCapiConfigured(): Promise<boolean> {
  const m = await resolvePlatformMetaConfig();
  return !!(m.pixelId && m.capiToken);
}

export async function sendCapiEvent(input: CapiEventInput, tenantId: string | null, adAccountId: string | null): Promise<void> {
  // An owner previewing their own funnel. Everything else about the run is real;
  // this is the single thing that must not reach Meta. See CapiEventInput.preview.
  if (input.preview) return undefined;
  const cfg = await getConfig(tenantId, adAccountId);
  if (!cfg) return; // inert until configured

  // PRODUCTION path: never attach test_event_code. A lingering
  // META_CAPI_TEST_EVENT_CODE would otherwise route every real conversion
  // (Purchase121, AssessmentCompleted…) to Events Manager → Test Events, where
  // the campaign can't count it. The CAPI Tester uses its own (testCapi) path.
  const body = JSON.stringify({
    data: [buildCapiEvent(withSourceUrl(input))],
  });

  const url = `https://graph.facebook.com/${cfg.version}/${cfg.datasetId}/events?access_token=${encodeURIComponent(cfg.accessToken)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      console.error(`[meta-capi] ${input.eventName} failed: ${res.status} ${text}`);
    }
  } catch (e) {
    console.error(
      `[meta-capi] ${input.eventName} error:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}
