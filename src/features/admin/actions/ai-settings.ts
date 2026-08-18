"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, type ActingScope } from "@/lib/tenant/acting";
import { env } from "@/lib/env";
import { encryptWithSecret, decryptWithSecret } from "@/lib/crypto";
import { isAiProvider, type AiProvider } from "@/lib/ai/types";
import { testStatement } from "@/lib/ai/generate";
import { listPromptVersions } from "@/lib/ai/versions";
import { PREVIEW_SAMPLE, SAMPLE_EASY_READ, DEFAULT_PROMPT_VERSION } from "@/lib/ai/prompt-versions";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { tenantAppSettingId } from "@/lib/settings/tenant-row";

const schema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["claude", "openai", "gemini"]),
  model: z.string().max(120).optional().or(z.literal("")),
  guidance: z.string().max(2000).optional().or(z.literal("")),
  promptVersion: z.string().max(60).optional().or(z.literal("")),
});
export type AiSettingsInput = z.infer<typeof schema>;

/** Encrypted-key column for each provider — keys are stored once, per provider. */
const KEY_COLUMN: Record<AiProvider, "aiClaudeKeyEnc" | "aiOpenAiKeyEnc" | "aiGeminiKeyEnc"> = {
  claude: "aiClaudeKeyEnc",
  openai: "aiOpenAiKeyEnc",
  gemini: "aiGeminiKeyEnc",
};

export interface ProviderKeyView {
  provider: AiProvider;
  hasKey: boolean;
  last4: string | null;
}

export interface PromptVersionView {
  id: string;
  number: number | null;
  label: string;
  description: string;
  builtin: boolean;
  instructions: string;
  /** The system prompt assembled against the sample, for display. */
  system: string;
  active: boolean;
}

export interface AiSettingsView {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  guidance: string;
  /** One entry per provider: whether a key is saved + its last 4 chars. */
  keys: ProviderKeyView[];
  /** The tenant DEFAULT version id (new assessments inherit it). */
  promptVersion: string;
  wordMin: number;
  wordMax: number;
  versions: PromptVersionView[];
  sampleName: string;
  sampleEasyRead: string;
}

/** The AppSetting row for a scope: the singleton for the platform/super view, or the
 *  tenant's own row (which may not exist yet → null). A tenant never sees the singleton. */
async function readScopeSetting(scope: ActingScope) {
  return scope.tenantId
    ? prisma.appSetting.findUnique({ where: { tenantId: scope.tenantId } })
    : prisma.appSetting.findUnique({ where: { id: "singleton" } });
}

function keyInfo(enc: string | null | undefined): { hasKey: boolean; last4: string | null } {
  if (!enc) return { hasKey: false, last4: null };
  const dec = decryptWithSecret(enc, env.BETTER_AUTH_SECRET);
  return { hasKey: Boolean(dec), last4: dec ? dec.slice(-4) : null };
}

export async function getAiSettings(): Promise<AiSettingsView> {
  const scope = await resolveActingScope();
  const s = await readScopeSetting(scope);

  // Per-provider keys. Fold the legacy single key into the active provider's slot so
  // pre-migration configs still show a saved key for the provider they were using.
  const enc: Record<AiProvider, string | null> = {
    claude: s?.aiClaudeKeyEnc ?? null,
    openai: s?.aiOpenAiKeyEnc ?? null,
    gemini: s?.aiGeminiKeyEnc ?? null,
  };
  const legacyProvider = s?.aiProvider && isAiProvider(s.aiProvider) ? s.aiProvider : null;
  if (legacyProvider && !enc[legacyProvider] && s?.aiApiKeyEnc) enc[legacyProvider] = s.aiApiKeyEnc;
  const keys: ProviderKeyView[] = (["claude", "openai", "gemini"] as AiProvider[]).map((p) => ({
    provider: p,
    ...keyInfo(enc[p]),
  }));

  // Tenant default version id (falls back to the built-in default when unset/invalid).
  const rows = await listPromptVersions(scope.tenantId);
  const active = rows.some((r) => r.id === s?.aiPromptVersion)
    ? (s?.aiPromptVersion as string)
    : DEFAULT_PROMPT_VERSION;
  const versions: PromptVersionView[] = rows.map((r) => ({ ...r, active: r.id === active }));

  return {
    enabled: s?.aiEnabled ?? false,
    provider: s?.aiProvider && isAiProvider(s.aiProvider) ? s.aiProvider : "claude",
    model: s?.aiModel ?? "",
    guidance: s?.aiGuidance ?? "",
    keys,
    promptVersion: active,
    wordMin: s?.aiWordMin ?? 200,
    wordMax: s?.aiWordMax ?? 280,
    versions,
    sampleName: PREVIEW_SAMPLE.firstName ?? "Sample",
    sampleEasyRead: SAMPLE_EASY_READ,
  };
}

/** Save ONE provider's API key (encrypted), independent of which provider is active.
 *  Keys are entered once per provider; selecting a provider/model never re-prompts. */
export async function saveProviderKey(provider: string, key: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!isAiProvider(provider)) return { ok: false, error: "Unknown provider." };
  const k = (key ?? "").trim();
  if (!k) return { ok: false, error: "Paste the API key first." };
  if (k.length > 400) return { ok: false, error: "That key looks too long." };

  const column = KEY_COLUMN[provider];
  const data = { [column]: encryptWithSecret(k, env.BETTER_AUTH_SECRET) };
  if (scope.tenantId) {
    await prisma.appSetting.upsert({
      where: { tenantId: scope.tenantId },
      update: data,
      create: { id: tenantAppSettingId(scope.tenantId), tenantId: scope.tenantId, ...data },
    });
  } else {
    await prisma.appSetting.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
  }
  revalidatePath("/admin/ai");
  revalidatePath("/w/settings");
  return { ok: true };
}

export async function updateAiSettings(input: AiSettingsInput): Promise<ActionResult> {
  const scope = await resolveActingScope();
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  // Enabling requires a key for the SELECTED provider (keys are saved separately).
  const existing = await readScopeSetting(scope);
  const selectedEnc = existing?.[KEY_COLUMN[d.provider]] ?? (existing?.aiProvider === d.provider ? existing?.aiApiKeyEnc : null);
  if (d.enabled && !selectedEnc) {
    return { ok: false, error: `Save a ${d.provider} API key above before enabling AI.` };
  }

  // NOTE: the default prompt version is managed separately (setDefaultPromptVersion),
  // and API keys are saved separately (saveProviderKey), so this action touches
  // neither aiPromptVersion nor any key column.
  const data = {
    aiEnabled: d.enabled,
    aiProvider: d.provider,
    aiModel: d.model && d.model.trim() ? d.model.trim() : null,
    aiGuidance: d.guidance && d.guidance.trim() ? d.guidance.trim() : null,
  };

  if (scope.tenantId) {
    await prisma.appSetting.upsert({
      where: { tenantId: scope.tenantId },
      update: data,
      create: { id: tenantAppSettingId(scope.tenantId), tenantId: scope.tenantId, ...data },
    });
  } else {
    await prisma.appSetting.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
  }
  revalidatePath("/admin/ai");
  revalidatePath("/w/settings");
  return { ok: true };
}

/** Run the saved AI config against the sample; surfaces latency + any error.
 *  Pass a versionId to preview a specific prompt version (else the active one). */
export async function testAi(
  versionId?: string,
): Promise<{ ok: boolean; ms: number; text?: string; error?: string }> {
  const scope = await resolveActingScope();
  if (!scope.isSuper && !scope.tenantId) return { ok: false, ms: 0, error: "No workspace." };
  return testStatement(versionId, scope.tenantId);
}
