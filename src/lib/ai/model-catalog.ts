import "server-only";
import { createHash } from "node:crypto";
import { MODELS_BY_PROVIDER, type AiModelOption, type AiProvider } from "@/lib/ai/types";

/**
 * The live model list for a provider, read from the provider itself with a saved key.
 *
 * The owner's rule: the dropdown shows every model the provider offers, at all times,
 * and nobody ever adds one by hand. So the list comes from each provider's own
 * "list models" endpoint, newest first, and the static MODELS_BY_PROVIDER list is only
 * the fallback for when there is no key or the provider cannot be reached.
 *
 * Cached in memory for an hour per provider and key (the key is hashed, never held as
 * a cache key in the clear), so opening the settings page does not call out every time.
 * Only successful fetches are cached: a failure falls back and tries again next time.
 */

const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
/** A runaway paginator must not hang the page. */
const MAX_PAGES = 10;

const cache = new Map<string, { at: number; models: AiModelOption[] }>();

/**
 * Why the list is what it is. The settings screen says this under the dropdown, so the
 * next time the live list does not appear the screen answers why instead of a guess:
 *   live    - read from the provider just now (or within the hour)
 *   held    - the live list is not released to this workspace (release switch)
 *   no-key  - neither this scope nor the platform has a key saved for this provider
 *   error   - the provider call failed; `detail` carries the HTTP status or message
 */
export type ModelCatalogSource = "live" | "held" | "no-key" | "error";

export interface ModelCatalog {
  models: AiModelOption[];
  /** True when the list came from the provider; false means the static fallback. */
  live: boolean;
  source: ModelCatalogSource;
  /** For `error`: what the provider said, short and key-free. */
  detail?: string;
}

export function fallbackModels(
  provider: AiProvider,
  source: Exclude<ModelCatalogSource, "live"> = "no-key",
  detail?: string,
): ModelCatalog {
  return { models: MODELS_BY_PROVIDER[provider], live: false, source, ...(detail ? { detail } : {}) };
}

export async function listProviderModels(
  provider: AiProvider,
  apiKey: string | null,
): Promise<ModelCatalog> {
  if (!apiKey) return fallbackModels(provider, "no-key");
  const cacheKey = `${provider}:${createHash("sha256").update(apiKey).digest("hex")}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return { models: hit.models, live: true, source: "live" };

  try {
    const models =
      provider === "claude"
        ? await fetchAnthropic(apiKey)
        : provider === "openai"
          ? await fetchOpenAi(apiKey)
          : await fetchGemini(apiKey);
    if (models.length === 0) return fallbackModels(provider, "error", "the provider returned no models");
    cache.set(cacheKey, { at: Date.now(), models });
    return { models, live: true, source: "live" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[ai] model list fetch failed for ${provider}:`, detail);
    return fallbackModels(provider, "error", detail.slice(0, 160));
  }
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) {
    // The provider's own error message, so "HTTP 401" says WHICH 401 (bad key, key
    // disabled, wrong workspace). Never the key itself: providers do not echo it.
    let why = "";
    try {
      const b = asRecord(await res.json());
      why = str(asRecord(b.error).message) ?? str(b.message) ?? "";
    } catch {
      why = "";
    }
    throw new Error(`HTTP ${res.status}${why ? `: ${why}` : ""}`);
  }
  return res.json();
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Anthropic: GET /v1/models, paginated by after_id, returned newest first. */
async function fetchAnthropic(apiKey: string): Promise<AiModelOption[]> {
  const out: { value: string; label: string; at: number }[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: "1000" });
    if (after) qs.set("after_id", after);
    const body = asRecord(
      await getJson(`https://api.anthropic.com/v1/models?${qs.toString()}`, {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      }),
    );
    for (const m of asArray(body.data)) {
      const r = asRecord(m);
      const id = str(r.id);
      if (!id) continue;
      const created = str(r.created_at);
      out.push({ value: id, label: str(r.display_name) ?? id, at: created ? Date.parse(created) || 0 : 0 });
    }
    const next = str(body.last_id);
    if (body.has_more !== true || !next) break;
    after = next;
  }
  return newestFirst(out);
}

/** OpenAI: GET /v1/models, one page, filtered to the chat and text models. */
const OPENAI_INCLUDE = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_EXCLUDE = /(audio|realtime|transcribe|tts|image|embedding|moderation|search)/;

async function fetchOpenAi(apiKey: string): Promise<AiModelOption[]> {
  const body = asRecord(
    await getJson("https://api.openai.com/v1/models", { authorization: `Bearer ${apiKey}` }),
  );
  const out: { value: string; label: string; at: number }[] = [];
  for (const m of asArray(body.data)) {
    const r = asRecord(m);
    const id = str(r.id);
    if (!id || !OPENAI_INCLUDE.test(id) || OPENAI_EXCLUDE.test(id)) continue;
    out.push({ value: id, label: id, at: typeof r.created === "number" ? r.created * 1000 : 0 });
  }
  return newestFirst(out);
}

/** Gemini: models.list, paginated by pageToken, filtered to generateContent. */
const GEMINI_EXCLUDE = /(embedding|imagen|tts|image|aqa)/;

async function fetchGemini(apiKey: string): Promise<AiModelOption[]> {
  const out: { value: string; label: string; at: number }[] = [];
  let token: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ pageSize: "1000" });
    if (token) qs.set("pageToken", token);
    const body = asRecord(
      await getJson(`https://generativelanguage.googleapis.com/v1beta/models?${qs.toString()}`, {
        "x-goog-api-key": apiKey,
      }),
    );
    for (const m of asArray(body.models)) {
      const r = asRecord(m);
      const name = str(r.name);
      if (!name) continue;
      const methods = asArray(r.supportedGenerationMethods);
      if (!methods.includes("generateContent")) continue;
      const id = name.replace(/^models\//, "");
      if (GEMINI_EXCLUDE.test(id)) continue;
      // Gemini gives no creation date, so the version in the id stands in for it.
      out.push({ value: id, label: str(r.displayName) ?? id, at: geminiVersion(id) });
    }
    token = str(body.nextPageToken);
    if (!token) break;
  }
  return newestFirst(out);
}

/** "gemini-2.5-pro" -> 2.5, so a higher version sorts first. */
function geminiVersion(id: string): number {
  const m = /(\d+(?:\.\d+)?)/.exec(id);
  return m ? Number(m[1]) : 0;
}

function newestFirst(list: { value: string; label: string; at: number }[]): AiModelOption[] {
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => b.at - a.at || a.value.localeCompare(b.value))
    .filter((m) => (seen.has(m.value) ? false : (seen.add(m.value), true)))
    .map(({ value, label }) => ({ value, label: label === value ? value : `${label} (${value})` }));
}
