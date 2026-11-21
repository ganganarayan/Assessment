"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, scopeOwnerDenied, configTenantOf, type ActingScope } from "@/lib/tenant/acting";
import { env } from "@/lib/env";
import { encryptWithSecret, decryptWithSecret } from "@/lib/crypto";
import { DEFAULT_MODEL as DEFAULT_MODEL_FOR, isAiProvider, modelFitsProvider, type AiProvider } from "@/lib/ai/types";
import { modelForTenant, parsePlanModels } from "@/lib/ai/plan-models";
import { resolvePlan } from "@/lib/billing/entitlements";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { listProviderModels, fallbackModels, type ModelCatalog } from "@/lib/ai/model-catalog";
import { featureAllowedFor, featureDenied } from "@/lib/features/release";
import { testStatement } from "@/lib/ai/generate";
import { listPromptVersions } from "@/lib/ai/versions";
import { builtInPromptsAllowed } from "@/lib/ai/scope";
import {
  PREVIEW_SAMPLE,
  NEUTRAL_SAMPLE,
  SAMPLE_EASY_READ,
  DEFAULT_PROMPT_VERSION,
} from "@/lib/ai/prompt-versions";
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

/** Encrypted-key column for each provider - keys are stored once, per provider. */
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
  /** Whether this scope sees the built-in reference versions (platform + the owner's
   *  own businesses). False in a customer workspace: no built-ins, no built-in length
   *  control, and an empty list means "write your first one", not "something is wrong". */
  showBuiltins: boolean;
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

  // Tenant default version id. Falls back to the built-in default ONLY where the
  // built-ins are visible; in a customer workspace there is nothing to fall back to,
  // so an unset/stale default resolves to none and the AI statement is simply skipped
  // until they write a version of their own.
  const configTenant = configTenantOf(scope);
  const showBuiltins = await builtInPromptsAllowed(configTenant);
  const rows = await listPromptVersions(configTenant);
  const active = rows.some((r) => r.id === s?.aiPromptVersion)
    ? (s?.aiPromptVersion as string)
    : showBuiltins
      ? DEFAULT_PROMPT_VERSION
      : "";
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
    // The worked example is the owner's own scenario and the owner's own written
    // reference statement. Neither belongs in a customer's workspace.
    sampleName: (showBuiltins ? PREVIEW_SAMPLE.firstName : NEUTRAL_SAMPLE.firstName) ?? "Sample",
    sampleEasyRead: showBuiltins ? SAMPLE_EASY_READ : "",
    showBuiltins,
  };
}

/**
 * Every model the provider currently offers, read live with this scope's saved key for
 * that provider, or the platform's key when the scope has none. Falls back to the
 * static list when neither exists or the provider cannot be reached. Read only: it
 * never touches which model is saved.
 */
export async function listAiModels(provider: string): Promise<ModelCatalog> {
  if (!isAiProvider(provider)) return { models: [], live: false, source: "no-key" };
  const scope = await resolveActingScope();
  if (!scope.isSuper && !scope.tenantId) return fallbackModels(provider, "no-key");
  // Release switch: held back = the built-in list for every customer workspace. The
  // platform and internal workspaces are exempt, so the owner keeps the live list.
  if (!(await featureAllowedFor("liveAiModels", scope.tenantId))) return fallbackModels(provider, "held");

  const column = KEY_COLUMN[provider];
  const pick = (row: Awaited<ReturnType<typeof readScopeSetting>>): string | null => {
    const enc = row?.[column] ?? (row?.aiProvider === provider ? row?.aiApiKeyEnc : null);
    return enc ? decryptWithSecret(enc, env.BETTER_AUTH_SECRET) || null : null;
  };

  let key = pick(await readScopeSetting(scope));
  if (!key && scope.tenantId) {
    key = pick(await prisma.appSetting.findUnique({ where: { id: "singleton" } }));
  }
  return listProviderModels(provider, key);
}

export interface WorkspaceModelView {
  provider: AiProvider;
  /** The saved pick; "" = the default below. */
  model: string;
  /** What runs when nothing is picked: the plan's model, or the provider default. */
  defaultModel: string;
  /** True = the workspace runs on its own key, so the pick is its own aiModel. */
  ownKey: boolean;
}

function decryptedKey(
  row: Awaited<ReturnType<typeof readScopeSetting>>,
  provider: AiProvider,
): string | null {
  const enc = row?.[KEY_COLUMN[provider]] ?? (row?.aiProvider === provider ? row?.aiApiKeyEnc : null);
  return enc ? decryptWithSecret(enc, env.BETTER_AUTH_SECRET) || null : null;
}

/**
 * The Model picker on /w/ai. Null = no picker: the platform scope (it has /admin/ai),
 * or the liveAiModels release switch holds this workspace back. Released, every
 * workspace gets it; held, only the platform and internal workspaces.
 *
 * Two destinations, decided by whose key runs the statement:
 *   own key      - the workspace's aiModel, the same field /admin/ai edits inside it
 *   platform key - aiWorkspaceModel, read by generate.ts under the same switch, below
 *                  the owner's per-tenant override and above the plan's model
 */
export async function getWorkspaceModelView(): Promise<WorkspaceModelView | null> {
  const scope = await resolveActingScope();
  if (!scope.tenantId || isPlatformScope(scope.tenantId)) return null;
  if (!(await featureAllowedFor("liveAiModels", scope.tenantId))) return null;

  const own = await readScopeSetting(scope);
  const ownProvider = own?.aiProvider && isAiProvider(own.aiProvider) ? own.aiProvider : null;
  if (ownProvider && decryptedKey(own, ownProvider)) {
    return { provider: ownProvider, model: own?.aiModel ?? "", defaultModel: DEFAULT_MODEL_FOR[ownProvider], ownKey: true };
  }

  const platform = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  const provider = platform?.aiProvider && isAiProvider(platform.aiProvider) ? platform.aiProvider : "claude";
  const [resolved, tenant] = await Promise.all([
    resolvePlan(scope.tenantId),
    prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { aiModelOverride: true } }),
  ]);
  const defaultModel = modelForTenant({
    override: tenant?.aiModelOverride,
    plan: resolved.plan,
    planModels: parsePlanModels(platform?.aiPlanModels ?? null),
  });
  return { provider, model: own?.aiWorkspaceModel ?? "", defaultModel, ownKey: false };
}

const workspaceModelSchema = z.string().trim().max(120);

/** Save the /w/ai Model pick. Blank = back to the default. */
export async function saveWorkspaceModel(model: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  if (!scope.tenantId || isPlatformScope(scope.tenantId)) return { ok: false, error: "No workspace." };
  const held = await featureDenied("liveAiModels", scope.tenantId);
  if (held) return held;
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const parsed = workspaceModelSchema.safeParse(model ?? "");
  if (!parsed.success) return { ok: false, error: "That model id looks too long." };

  const view = await getWorkspaceModelView();
  if (!view) return { ok: false, error: "That is not available in your workspace." };
  const value = parsed.data || null;
  if (value && !modelFitsProvider(value, view.provider)) {
    return { ok: false, error: "That model belongs to a different provider." };
  }

  const data = view.ownKey ? { aiModel: value } : { aiWorkspaceModel: value };
  await prisma.appSetting.upsert({
    where: { tenantId: scope.tenantId },
    update: data,
    create: { id: tenantAppSettingId(scope.tenantId), tenantId: configTenantOf(scope), ...data },
  });
  revalidatePath("/w/ai");
  return { ok: true };
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
      create: { id: tenantAppSettingId(scope.tenantId), tenantId: configTenantOf(scope), ...data },
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
      create: { id: tenantAppSettingId(scope.tenantId), tenantId: configTenantOf(scope), ...data },
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

/**
 * Save the ADMIN credentials that read what the providers actually billed.
 *
 * 🔴 PLATFORM ONLY, AND NEVER USED TO GENERATE. An admin key reads the organisation's
 * cost report; Anthropic's starts sk-ant-admin and only an org admin can mint one. A
 * tenant has no business holding one, so this refuses anyone but a super admin, and
 * writes to the platform row regardless of which workspace is being acted in.
 *
 * The api key ids say which key inside a shared provider organisation belongs to THIS
 * product. Assess360 shares an account with the other apps, separated by API key, so
 * the day's real spend is split by each key's share of that day's tokens. Blank means
 * the whole organisation's bill is counted as ours, which is only right on a dedicated
 * account - the Accounts page says so when it is blank.
 *
 * A blank KEY leaves the stored one alone, like every other secret field here: the
 * form never receives the saved value back, so treating blank as "clear it" would wipe
 * a working credential every time somebody edited the field next to it.
 */
export async function updateAiAdminKeys(input: {
  claudeAdminKey?: string;
  openAiAdminKey?: string;
  claudeApiKeyId?: string;
  openAiApiKeyId?: string;
}): Promise<ActionResult> {
  const scope = await resolveActingScope();
  if (!scope.isSuper) return { ok: false, error: "Super admin only." };
  // The providers' ADMIN keys read the whole organisation's billing: owner only.
  const notOwner = scopeOwnerDenied(scope);
  if (notOwner) return notOwner;

  const data: Record<string, string | null> = {};
  const claude = input.claudeAdminKey?.trim();
  const openai = input.openAiAdminKey?.trim();
  if (claude) data.aiClaudeAdminKeyEnc = encryptWithSecret(claude, env.BETTER_AUTH_SECRET);
  if (openai) data.aiOpenAiAdminKeyEnc = encryptWithSecret(openai, env.BETTER_AUTH_SECRET);

  // Ids are not secrets, so blank genuinely means "clear it" here.
  if (input.claudeApiKeyId !== undefined) data.aiClaudeApiKeyId = input.claudeApiKeyId.trim() || null;
  if (input.openAiApiKeyId !== undefined) data.aiOpenAiApiKeyId = input.openAiApiKeyId.trim() || null;

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
  revalidatePath("/admin/ai");
  revalidatePath("/platform/accounts");
  return { ok: true };
}

/**
 * What the billing-access form needs to render.
 *
 * Says WHETHER each admin key is saved, never what it is: the form is write-only, and
 * a secret that is read back to a screen is a secret that ends up in a screenshot. The
 * api key ids are not secrets and come back in full so they can be edited.
 */
export async function getAiAdminKeyView(): Promise<{
  claudeSaved: boolean;
  openAiSaved: boolean;
  claudeApiKeyId: string;
  openAiApiKeyId: string;
} | null> {
  const scope = await resolveActingScope();
  if (!scope.isSuper) return null;
  const row = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: {
      aiClaudeAdminKeyEnc: true,
      aiOpenAiAdminKeyEnc: true,
      aiClaudeApiKeyId: true,
      aiOpenAiApiKeyId: true,
    },
  });
  return {
    claudeSaved: Boolean(row?.aiClaudeAdminKeyEnc),
    openAiSaved: Boolean(row?.aiOpenAiAdminKeyEnc),
    claudeApiKeyId: row?.aiClaudeApiKeyId ?? "",
    openAiApiKeyId: row?.aiOpenAiApiKeyId ?? "",
  };
}
