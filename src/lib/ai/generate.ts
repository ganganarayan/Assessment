import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";
import { buildStatementMessages } from "@/lib/ai/prompt";
import { DEFAULT_MODEL, isAiProvider, type AiConfig, type StatementInput } from "@/lib/ai/types";

/**
 * Server-side LLM call for the personalized result statement. Fully fail-soft:
 * returns null when AI is disabled/unconfigured or on any error/timeout, so the
 * destination page falls back to the static suggestion and the submission flow
 * is never broken. The API key is decrypted here and never leaves the server.
 */

const TIMEOUT_MS = 12_000;
const MAX_TOKENS = 400;

export async function getAiConfig(): Promise<AiConfig | null> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
    if (!s || !s.aiEnabled || !s.aiApiKeyEnc || !s.aiProvider) return null;
    if (!isAiProvider(s.aiProvider)) return null;
    const apiKey = decryptWithSecret(s.aiApiKeyEnc, env.BETTER_AUTH_SECRET);
    if (!apiKey) return null;
    return {
      provider: s.aiProvider,
      model: s.aiModel?.trim() || DEFAULT_MODEL[s.aiProvider],
      apiKey,
      guidance: s.aiGuidance ?? null,
    };
  } catch (e) {
    // Fail-soft at the source: a DB blip here must never break the caller.
    console.error("[ai] config error:", e instanceof Error ? e.message : String(e));
    return null;
  }
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
    const { system, user } = buildStatementMessages({
      ...input,
      guidance: input.guidance ?? cfg.guidance,
    });
    if (cfg.provider === "claude") return await callClaude(cfg, system, user);
    if (cfg.provider === "openai") return await callOpenAI(cfg, system, user);
    return await callGemini(cfg, system, user);
  } catch (e) {
    console.error("[ai] generation error:", e instanceof Error ? e.message : String(e));
    return null;
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
  if (!res.ok) {
    console.error("[ai] claude", res.status, (await res.text()).slice(0, 300));
    return null;
  }
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
  if (!res.ok) {
    console.error("[ai] openai", res.status, (await res.text()).slice(0, 300));
    return null;
  }
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
  if (!res.ok) {
    console.error("[ai] gemini", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return clean(data.candidates?.[0]?.content?.parts?.[0]?.text);
}
