import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";
import { buildStatementMessages, humanizeStatement } from "@/lib/ai/prompt";
import { applyCrisisLine } from "@/lib/ai/crisis";
import { PREVIEW_SAMPLE } from "@/lib/ai/prompt-versions";
import { DEFAULT_MODEL, isAiProvider, type AiConfig, type StatementInput } from "@/lib/ai/types";

/**
 * Server-side LLM call for the personalized result statement. Fully fail-soft:
 * returns null when AI is disabled/unconfigured or on any error/timeout, so the
 * destination page falls back to the static suggestion and the submission flow
 * is never broken. The API key is decrypted here and never leaves the server.
 */

// Generous: a 100–150 word Sonnet completion can run ~9–13s, and the funnel
// shows a 10s "Analyzing…" countdown, so allow headroom before failing soft.
const TIMEOUT_MS = 20_000;
const MAX_TOKENS = 400;

async function readAiConfig(requireEnabled: boolean): Promise<AiConfig | null> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
    if (!s || !s.aiApiKeyEnc || !s.aiProvider) return null;
    if (requireEnabled && !s.aiEnabled) return null;
    if (!isAiProvider(s.aiProvider)) return null;
    const apiKey = decryptWithSecret(s.aiApiKeyEnc, env.BETTER_AUTH_SECRET);
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

/** Config used to actually GENERATE on the funnel — only when AI is enabled. */
export async function getAiConfig(): Promise<AiConfig | null> {
  return readAiConfig(true);
}

export async function isAiConfigured(): Promise<boolean> {
  return (await getAiConfig()) !== null;
}

export async function generatePersonalStatement(input: StatementInput): Promise<string | null> {
  // Total function: every step (config read, prompt build, provider call) is
  // inside the guard, so this can NEVER throw into completeSubmission.
  try {
    const cfg = await getAiConfig();
    if (!cfg) return null;
    const merged = { ...input, guidance: input.guidance ?? cfg.guidance };
    const { system, user } = buildStatementMessages(merged, cfg.promptVersion);
    const text = await callProvider(cfg, system, user);
    // Crisis line is injected AFTER humanize so its em dash + phone number stay verbatim.
    return text ? applyCrisisLine(text, merged.bandLevel, merged.percentage) : text;
  } catch (e) {
    console.error("[ai] generation error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function callProvider(cfg: AiConfig, system: string, user: string): Promise<string | null> {
  const text =
    cfg.provider === "claude"
      ? await callClaude(cfg, system, user)
      : cfg.provider === "openai"
        ? await callOpenAI(cfg, system, user)
        : await callGemini(cfg, system, user);
  return text ? humanizeStatement(text) : text;
}

/**
 * Admin preview/test: runs the configured provider against the Swannik sample
 * and SURFACES the error/latency (unlike generatePersonalStatement, which
 * swallows). `versionId` lets the dashboard compare prompt versions; omitted =
 * the active version.
 */
export async function testStatement(versionId?: string): Promise<{
  ok: boolean;
  ms: number;
  text?: string;
  error?: string;
}> {
  // Test ignores the Enable toggle — you test the key/model first, THEN enable.
  const cfg = await readAiConfig(false);
  if (!cfg) {
    return { ok: false, ms: 0, error: "No API key saved (or it couldn't be read). Save a provider + key first." };
  }
  const { system, user } = buildStatementMessages(
    { ...PREVIEW_SAMPLE, guidance: cfg.guidance },
    versionId ?? cfg.promptVersion,
  );
  const t0 = Date.now();
  try {
    const raw = await callProvider(cfg, system, user);
    const text = raw ? applyCrisisLine(raw, PREVIEW_SAMPLE.bandLevel, PREVIEW_SAMPLE.percentage) : raw;
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
