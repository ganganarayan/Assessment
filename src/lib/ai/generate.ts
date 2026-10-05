import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";
import { buildStatementMessages, humanizeStatement } from "@/lib/ai/prompt";
import { applyCrisisLine } from "@/lib/ai/crisis";
import { PREVIEW_SAMPLE, NEUTRAL_SAMPLE } from "@/lib/ai/prompt-versions";
import { resolvePromptVersion, getWordWindow } from "@/lib/ai/versions";
import { builtInPromptsAllowed } from "@/lib/ai/scope";
import { DEFAULT_MODEL, isAiProvider, type AiConfig, type AiProvider, type StatementInput } from "@/lib/ai/types";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { resolvePlan, tenantCan } from "@/lib/billing/entitlements";
import { modelForTenant, parsePlanModels } from "@/lib/ai/plan-models";
import { CLINIC_SYSTEM_PROMPT } from "@/lib/ai/clinic-prompt";
import { appSettingWhere } from "@/lib/settings/tenant-row";

/**
 * Server-side LLM call for the personalized result statement. Fully fail-soft:
 * returns null when AI is disabled/unconfigured or on any error/timeout, so the
 * destination page falls back to the static suggestion and the submission flow
 * is never broken. The API key is decrypted here and never leaves the server.
 */

// Generous: a 100-150 word Sonnet completion can run ~9-13s, and the funnel
// shows a 10s "Analyzing…" countdown, so allow headroom before failing soft.
const TIMEOUT_MS = 30_000;
// Headroom so a message NEVER gets cut mid-word. Length is governed by the
// instructions (e.g. "180-240 words"), not this ceiling. ~240 words ≈ 330 tokens.
const MAX_TOKENS = 900;

/** Decrypt whichever key a settings row holds for its selected provider. */
function keyFromRow(s: {
  aiProvider: string | null;
  aiClaudeKeyEnc: string | null;
  aiOpenAiKeyEnc: string | null;
  aiGeminiKeyEnc: string | null;
  aiApiKeyEnc: string | null;
}): { provider: AiProvider; apiKey: string } | null {
  if (!s.aiProvider || !isAiProvider(s.aiProvider)) return null;
  const perProvider = {
    claude: s.aiClaudeKeyEnc,
    openai: s.aiOpenAiKeyEnc,
    gemini: s.aiGeminiKeyEnc,
  }[s.aiProvider];
  // Fall back to the legacy single key so pre-migration configs keep working.
  const enc = perProvider ?? s.aiApiKeyEnc;
  if (!enc) return null;
  const apiKey = decryptWithSecret(enc, env.BETTER_AUTH_SECRET);
  return apiKey ? { provider: s.aiProvider, apiKey } : null;
}

/**
 * Resolve the provider, key and model for one scope.
 *
 * PLATFORM scope reads the singleton and is unchanged.
 *
 * A TENANT no longer brings a key. Asking a customer for an API key reads as the
 * product being a wrapper, and it hands them an argument against the response caps
 * that are the actual meter. So a tenant generates on the PLATFORM's key, and the
 * platform picks the model per plan (see lib/ai/plan-models) - the tenant chooses the
 * words, the owner chooses what producing them costs. Nothing says so on screen.
 *
 * Three things still gate a tenant:
 *   - the `aiReports` entitlement, so Gate has no AI and a PARKED workspace generates
 *     nothing (parked limits turn every feature off);
 *   - a system prompt version of their own, resolved by the caller;
 *   - the per-assessment `useAiStatement` toggle, read by the caller.
 *
 * A tenant that still holds its own key keeps using it. That is the owner's internal
 * businesses, which were configured before this and should not change behaviour, and
 * it costs one branch.
 */
async function readAiConfig(requireEnabled: boolean, tenantId: string | null = null): Promise<AiConfig | null> {
  try {
    if (isPlatformScope(tenantId)) {
      const s = await prisma.appSetting.findUnique({ where: appSettingWhere(null) as never });
      if (!s) return null;
      if (requireEnabled && !s.aiEnabled) return null;
      const key = keyFromRow(s);
      if (!key) return null;
      return {
        provider: key.provider,
        model: s.aiModel?.trim() || DEFAULT_MODEL[key.provider],
        apiKey: key.apiKey,
        guidance: s.aiGuidance ?? null,
        promptVersion: s.aiPromptVersion ?? null,
      };
    }

    // Entitlement first: no sense decrypting a key for a tenant that may not use it.
    if (!(await tenantCan(tenantId, "aiReports"))) return null;

    const [own, platform, tenant] = await Promise.all([
      prisma.appSetting.findUnique({ where: appSettingWhere(tenantId) as never }),
      prisma.appSetting.findUnique({ where: appSettingWhere(null) as never }),
      prisma.tenant.findUnique({
        where: { id: tenantId as string },
        select: { aiModelOverride: true },
      }),
    ]);

    // A tenant with its own key keeps its own provider, model and enable toggle.
    const ownKey = own ? keyFromRow(own) : null;
    if (ownKey) {
      if (requireEnabled && !own?.aiEnabled) return null;
      return {
        provider: ownKey.provider,
        model: own?.aiModel?.trim() || DEFAULT_MODEL[ownKey.provider],
        apiKey: ownKey.apiKey,
        guidance: own?.aiGuidance ?? null,
        promptVersion: own?.aiPromptVersion ?? null,
      };
    }

    // The ordinary path: the platform's key, the platform's choice of model.
    const platformKey = platform ? keyFromRow(platform) : null;
    if (!platformKey) return null;
    const resolved = await resolvePlan(tenantId);
    const model = modelForTenant({
      override: tenant?.aiModelOverride,
      plan: resolved.plan,
      planModels: parsePlanModels(platform?.aiPlanModels ?? null),
    });
    return {
      provider: platformKey.provider,
      model,
      apiKey: platformKey.apiKey,
      // The tenant's own historical guidance still applies to their own versions; the
      // platform's never leaks across.
      guidance: own?.aiGuidance ?? null,
      promptVersion: own?.aiPromptVersion ?? null,
    };
  } catch (e) {
    // Fail-soft at the source: a DB blip here must never break the caller.
    console.error("[ai] config error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Config used to actually GENERATE on the funnel - only when AI is enabled.
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
    if (!version) {
      return { text: null, error: "No system prompt version is set for this workspace. Add one under AI." };
    }
    const words = await getWordWindow(tenantId);
    // Instruction (V3+) versions are self-contained: do NOT fold in the historical
    // tenant guidance - the owner's instructions are the ONLY steer.
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
  // Total function: never throws into completeSubmission - swallows to null so the
  // funnel falls back to the static suggestion.
  return (await generatePersonalStatementResult(input, tenantId, versionId)).text;
}

/**
 * Clinic-audit 4-section prose. Uses the tenant's own AI provider/key with the
 * FIXED Divine Leads system prompt + a CONTEXT block of the ALREADY-COMPUTED
 * figures (the model never calculates). Fully fail-soft: returns null when AI is
 * off/unconfigured or on any error/timeout, so the result page renders the numbers
 * without prose. No humanizer/crisis line - this is a business audit, verbatim.
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
  // Test ignores the Enable toggle - you test the key/model first, THEN enable.
  const cfg = await readAiConfig(false, tenantId);
  if (!cfg) {
    return { ok: false, ms: 0, error: "No API key saved (or it couldn't be read). Save a provider + key first." };
  }
  const version = await resolvePromptVersion(versionId ?? cfg.promptVersion, tenantId);
  if (!version) {
    return { ok: false, ms: 0, error: "No system prompt version is set. Add one under AI, then test." };
  }
  const words = await getWordWindow(tenantId);
  // Same rule as the on-screen preview: a tenant tests against a neutral scenario, not
  // against the owner's own assessment.
  const sample = (await builtInPromptsAllowed(tenantId)) ? PREVIEW_SAMPLE : NEUTRAL_SAMPLE;
  const { system, user } = buildStatementMessages(
    { ...sample, guidance: version.minimal ? null : cfg.guidance },
    version,
    words,
  );
  const t0 = Date.now();
  try {
    const raw = await callProvider(cfg, system, user);
    const styled = raw ? (version.minimal ? raw : humanizeStatement(raw)) : raw;
    const text = styled ? applyCrisisLine(styled, sample.bandLevel, sample.percentage) : styled;
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
