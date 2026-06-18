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
