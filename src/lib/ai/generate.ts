import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";
import { buildStatementMessages, humanizeStatement } from "@/lib/ai/prompt";
import { applyCrisisLine } from "@/lib/ai/crisis";
import { PREVIEW_SAMPLE } from "@/lib/ai/prompt-versions";
import { resolvePromptVersion, getWordWindow } from "@/lib/ai/versions";
import { DEFAULT_MODEL, isAiProvider, type AiConfig, type StatementInput } from "@/lib/ai/types";
import { CLINIC_SYSTEM_PROMPT } from "@/lib/ai/clinic-prompt";

/**
 * Server-side LLM call for the personalized result statement. Fully fail-soft:
 * returns null when AI is disabled/unconfigured or on any error/timeout, so the
 * destination page falls back to the static suggestion and the submission flow
 * is never broken. The API key is decrypted here and never leaves the server.
 */

// Generous: a 100–150 word Sonnet completion can run ~9–13s, and the funnel
// shows a 10s "Analyzing…" countdown, so allow headroom before failing soft.
const TIMEOUT_MS = 30_000;
// Headroom so a message NEVER gets cut mid-word. Length is governed by the
// instructions (e.g. "180–240 words"), not this ceiling. ~240 words ≈ 330 tokens.
const MAX_TOKENS = 900;

async function readAiConfig(requireEnabled: boolean, tenantId: string | null = null): Promise<AiConfig | null> {
  try {
    // Gita/platform (tenantId null) reads the singleton, unchanged. A tenant reads
    // ONLY its own row — never the singleton — so Gita's API key is never used for,
    // or exposed to, a tenant. An unconfigured tenant simply gets no AI (returns null).
    const s = tenantId
      ? await prisma.appSetting.findUnique({ where: { tenantId } })
      : await prisma.appSetting.findUnique({ where: { id: "singleton" } });
    if (!s || !s.aiProvider) return null;
    if (requireEnabled && !s.aiEnabled) return null;
    if (!isAiProvider(s.aiProvider)) return null;
    // Use the key stored for the SELECTED provider; fall back to the legacy single
    // key so pre-migration configs keep working.
    const perProvider = {
      claude: s.aiClaudeKeyEnc,
      openai: s.aiOpenAiKeyEnc,
      gemini: s.aiGeminiKeyEnc,
    }[s.aiProvider];
    const enc = perProvider ?? s.aiApiKeyEnc;
    if (!enc) return null;
    const apiKey = decryptWithSecret(enc, env.BETTER_AUTH_SECRET);
    if (!apiKey) return null;
    return {
      provider: s.aiProvider,
      model: s.aiModel?.trim() || DEFAULT_MODEL[s.aiProvider],
      apiKey,
      guidance: s.aiGuidance ?? null,
      promptVersion: s.aiPromptVersion ?? null,
    };
  } catch (e) {
    // Fail-soft at the source: a DB blip here must never break the caller.
    console.error("[ai] config error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Config used to actually GENERATE on the funnel — only when AI is enabled.
 *  Pass the owning tenant (null = platform/Gita). */
export async function getAiConfig(tenantId: string | null = null): Promise<AiConfig | null> {
  return readAiConfig(true, tenantId);
}

export async function isAiConfigured(tenantId: string | null = null): Promise<boolean> {
  return (await getAiConfig(tenantId)) !== null;
}

/**
 * Detailed generate: returns the text AND the reason it's null, so admin surfaces
 * (result-page regenerate) can show WHY instead of a generic "returned nothing".
 * The funnel uses generatePersonalStatement (below), which swallows to null.
 */
export async function generatePersonalStatementResult(
  input: StatementInput,
  tenantId: string | null = null,
  versionId?: string | null,
): Promise<{ text: string | null; error: string | null }> {
  try {
    const cfg = await getAiConfig(tenantId);
    if (!cfg) {
      return { text: null, error: "AI is off or no API key is saved for the selected provider. Save the key and enable AI." };
    }
    // The assessment's chosen version wins; else the tenant default (cfg.promptVersion).
    const version = await resolvePromptVersion(versionId ?? cfg.promptVersion, tenantId);
    const words = await getWordWindow(tenantId);
    // Instruction (V3+) versions are self-contained: do NOT fold in the historical
    // tenant guidance — the owner's instructions are the ONLY steer.
    const guidance = version.minimal ? (input.guidance ?? null) : (input.guidance ?? cfg.guidance);
    const merged = { ...input, guidance };
    const { system, user } = buildStatementMessages(merged, version, words);
    const raw = await callProvider(cfg, system, user);
    if (!raw) return { text: null, error: `The ${cfg.provider} model (${cfg.model}) returned an empty response.` };
    // Instruction versions own their style verbatim (keep em dashes etc.); only the
    // built-in code versions get the dash-stripping humanizer. Crisis line is applied
    // AFTER so its em dash + phone number stay intact.
    const styled = version.minimal ? raw : humanizeStatement(raw);
    return { text: applyCrisisLine(styled, merged.bandLevel, merged.percentage), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ai] generation error:", msg);
    return { text: null, error: msg };
  }
}

export async function generatePersonalStatement(
  input: StatementInput,
  tenantId: string | null = null,
  versionId?: string | null,
): Promise<string | null> {
  // Total function: never throws into completeSubmission — swallows to null so the
  // funnel falls back to the static suggestion.
  return (await generatePersonalStatementResult(input, tenantId, versionId)).text;
}

/**
 * Clinic-audit 4-section prose. Uses the tenant's own AI provider/key with the
 * FIXED Divine Leads system prompt + a CONTEXT block of the ALREADY-COMPUTED
 * figures (the model never calculates). Fully fail-soft: returns null when AI is
 * off/unconfigured or on any error/timeout, so the result page renders the numbers
 * without prose. No humanizer/crisis line — this is a business audit, verbatim.
 */
export async function generateClinicStatement(
  context: string,
  tenantId: string | null = null,
): Promise<string | null> {
  try {
    const cfg = await getAiConfig(tenantId);
    if (!cfg) return null;
    const raw = await callProvider(cfg, CLINIC_SYSTEM_PROMPT, context);
    return clean(raw);
  } catch (e) {
    console.error("[ai] clinic statement error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function callProvider(cfg: AiConfig, system: string, user: string): Promise<string | null> {
  // Returns the RAW model text; humanizing (dash-stripping) is applied by the caller
  // only for built-in code versions, so instruction versions keep their style verbatim.
  return cfg.provider === "claude"
    ? callClaude(cfg, system, user)
    : cfg.provider === "openai"
      ? callOpenAI(cfg, system, user)
      : callGemini(cfg, system, user);
}

/**
 * Admin preview/test: runs the configured provider against the Swannik sample
 * and SURFACES the error/latency (unlike generatePersonalStatement, which
 * swallows). `versionId` lets the dashboard compare prompt versions; omitted =
 * the active version.
 */
export async function testStatement(versionId?: string, tenantId: string | null = null): Promise<{
  ok: boolean;
  ms: number;
  text?: string;
  error?: string;
}> {
  // Test ignores the Enable toggle — you test the key/model first, THEN enable.
  const cfg = await readAiConfig(false, tenantId);
  if (!cfg) {
    return { ok: false, ms: 0, error: "No API key saved (or it couldn't be read). Save a provider + key first." };
  }
  const version = await resolvePromptVersion(versionId ?? cfg.promptVersion, tenantId);
  const words = await getWordWindow(tenantId);
  const { system, user } = buildStatementMessages(
    { ...PREVIEW_SAMPLE, guidance: version.minimal ? null : cfg.guidance },
    version,
    words,
  );
  const t0 = Date.now();
  try {
    const raw = await callProvider(cfg, system, user);
    const styled = raw ? (version.minimal ? raw : humanizeStatement(raw)) : raw;
    const text = styled ? applyCrisisLine(styled, PREVIEW_SAMPLE.bandLevel, PREVIEW_SAMPLE.percentage) : styled;
    return { ok: true, ms: Date.now() - t0, text: text ?? "(model returned an empty response)" };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

function clean(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  return t.length > 0 ? t : null;
}

async function callClaude(cfg: AiConfig, system: string, user: string): Promise<string | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
  const text = data.content?.find((b) => b.type === "text")?.text ?? data.content?.[0]?.text;
  return clean(text);
}

async function callOpenAI(cfg: AiConfig, system: string, user: string): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return clean(data.choices?.[0]?.message?.content);
}

async function callGemini(cfg: AiConfig, system: string, user: string): Promise<string | null> {
  // Key is a query param; NEVER log this URL.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.model,
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return clean(data.candidates?.[0]?.content?.parts?.[0]?.text);
}
