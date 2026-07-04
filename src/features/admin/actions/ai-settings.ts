"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, type ActingScope } from "@/lib/tenant/acting";
import { env } from "@/lib/env";
import { encryptWithSecret, decryptWithSecret } from "@/lib/crypto";
import { isAiProvider, type AiProvider } from "@/lib/ai/types";
import { testStatement } from "@/lib/ai/generate";
import { buildStatementMessages } from "@/lib/ai/prompt";
import {
  PROMPT_VERSIONS,
  PREVIEW_SAMPLE,
  SAMPLE_EASY_READ,
  getPromptVersion,
} from "@/lib/ai/prompt-versions";
import { type ActionResult } from "@/features/assessment/actions/shared";

const schema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["claude", "openai", "gemini"]),
  model: z.string().max(120).optional().or(z.literal("")),
  guidance: z.string().max(2000).optional().or(z.literal("")),
  promptVersion: z.string().max(60).optional().or(z.literal("")),
  // Blank = keep the existing key (never round-trips the secret to the client).
  apiKey: z.string().max(400).optional().or(z.literal("")),
});
export type AiSettingsInput = z.infer<typeof schema>;

export interface PromptVersionView {
  id: string;
  label: string;
  description: string;
  /** The system prompt rendered against the sample, for display. */
  system: string;
  active: boolean;
}

export interface AiSettingsView {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  guidance: string;
  hasKey: boolean;
  keyLast4: string | null;
  promptVersion: string;
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

export async function getAiSettings(): Promise<AiSettingsView> {
  const scope = await resolveActingScope();
  const s = await readScopeSetting(scope);
  let keyLast4: string | null = null;
  if (s?.aiApiKeyEnc) {
    const dec = decryptWithSecret(s.aiApiKeyEnc, env.BETTER_AUTH_SECRET);
    keyLast4 = dec ? dec.slice(-4) : null;
  }
  const active = getPromptVersion(s?.aiPromptVersion).id;
  const versions: PromptVersionView[] = PROMPT_VERSIONS.map((v) => ({
    id: v.id,
    label: v.label,
    description: v.description,
    system: buildStatementMessages(PREVIEW_SAMPLE, v.id).system,
    active: v.id === active,
  }));

  return {
    enabled: s?.aiEnabled ?? false,
    provider: s?.aiProvider && isAiProvider(s.aiProvider) ? s.aiProvider : "claude",
    model: s?.aiModel ?? "",
    guidance: s?.aiGuidance ?? "",
    hasKey: Boolean(s?.aiApiKeyEnc),
    keyLast4,
    promptVersion: active,
    versions,
    sampleName: PREVIEW_SAMPLE.firstName ?? "Sample",
    sampleEasyRead: SAMPLE_EASY_READ,
  };
}

export async function updateAiSettings(input: AiSettingsInput): Promise<ActionResult> {
  const scope = await resolveActingScope();
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const existing = await readScopeSetting(scope);
  const newKey = d.apiKey && d.apiKey.trim() ? d.apiKey.trim() : null;
  const willHaveKey = newKey ? true : Boolean(existing?.aiApiKeyEnc);
  if (d.enabled && !willHaveKey) {
    return { ok: false, error: "Add an API key before enabling AI." };
  }

  // Only persist a known version id; anything else falls back to the default.
  const version =
    d.promptVersion && PROMPT_VERSIONS.some((v) => v.id === d.promptVersion)
      ? d.promptVersion
      : null;

  const data = {
    aiEnabled: d.enabled,
    aiProvider: d.provider,
    aiModel: d.model && d.model.trim() ? d.model.trim() : null,
    aiGuidance: d.guidance && d.guidance.trim() ? d.guidance.trim() : null,
    aiPromptVersion: version,
    ...(newKey ? { aiApiKeyEnc: encryptWithSecret(newKey, env.BETTER_AUTH_SECRET) } : {}),
  };

  if (scope.tenantId) {
    await prisma.appSetting.upsert({
      where: { tenantId: scope.tenantId },
      update: data,
      create: { tenantId: scope.tenantId, ...data },
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
