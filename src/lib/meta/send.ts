import { env } from "@/lib/env";
import { buildCapiEvent, resolveCapiConfig, type CapiEventInput } from "@/lib/meta/capi";

/**
 * Network sender for Meta Conversions API. Imports env (so it is NOT imported by
 * the pure verify harness). Fully fail-soft: a missing token makes it a no-op,
 * and any HTTP/network error is logged and swallowed — it must never break the
 * submission flow. The inert/config decision lives in the pure resolveCapiConfig.
 */

const TIMEOUT_MS = 4_000;

function getConfig() {
  return resolveCapiConfig({
    accessToken: env.META_CAPI_ACCESS_TOKEN,
    datasetId: env.META_DATASET_ID,
    pixelId: env.NEXT_PUBLIC_META_PIXEL_ID,
    version: env.META_GRAPH_API_VERSION,
    testEventCode: env.META_CAPI_TEST_EVENT_CODE,
  });
}

/** True when a token + dataset are configured (CAPI will actually send). */
export function isCapiConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Diagnostic: send a real `AssessmentCompleted` event server-side and return
 * Meta's ACTUAL response (events_received / error). This is the source of truth
 * for "is the app's event reaching Meta" — unlike sendCapiEvent it surfaces the
 * status + body instead of swallowing.
 */
export async function testCapi(testEventCode?: string, eventNameInput?: string): Promise<{
  ok: boolean;
  eventName: string;
  datasetId?: string;
  status?: number;
  response?: string;
  error?: string;
}> {
  const eventName = (eventNameInput && eventNameInput.trim()) || "AssessmentCompleted";
  const cfg = getConfig();
  if (!cfg) {
    return {
      ok: false,
      eventName,
      error:
        "META_CAPI_ACCESS_TOKEN (and a dataset/pixel id) is NOT set on this environment, so the app sends nothing to Meta. Add it in Railway → Variables for THIS service.",
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

export async function sendCapiEvent(input: CapiEventInput): Promise<void> {
  const cfg = getConfig();
  if (!cfg) return; // inert until configured

  const body = JSON.stringify({
    data: [buildCapiEvent(input)],
    ...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
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
