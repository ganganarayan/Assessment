"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { encryptWithSecret, decryptWithSecret } from "@/lib/crypto";
import { isAiProvider, type AiProvider } from "@/lib/ai/types";
import { testStatement } from "@/lib/ai/generate";
import { type ActionResult } from "@/features/assessment/actions/shared";

const schema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["claude", "openai", "gemini"]),
  model: z.string().max(120).optional().or(z.literal("")),
  guidance: z.string().max(2000).optional().or(z.literal("")),
  // Blank = keep the existing key (never round-trips the secret to the client).
  apiKey: z.string().max(400).optional().or(z.literal("")),
});
export type AiSettingsInput = z.infer<typeof schema>;

export interface AiSettingsView {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  guidance: string;
  hasKey: boolean;
  keyLast4: string | null;
}

export async function getAiSettings(): Promise<AiSettingsView> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  let keyLast4: string | null = null;
  if (s?.aiApiKeyEnc) {
    const dec = decryptWithSecret(s.aiApiKeyEnc, env.BETTER_AUTH_SECRET);
    keyLast4 = dec ? dec.slice(-4) : null;
  }
  return {
    enabled: s?.aiEnabled ?? false,
    provider: s?.aiProvider && isAiProvider(s.aiProvider) ? s.aiProvider : "claude",
    model: s?.aiModel ?? "",
    guidance: s?.aiGuidance ?? "",
    hasKey: Boolean(s?.aiApiKeyEnc),
    keyLast4,
  };
}

export async function updateAiSettings(input: AiSettingsInput): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const existing = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { aiApiKeyEnc: true },
  });
  const newKey = d.apiKey && d.apiKey.trim() ? d.apiKey.trim() : null;
  const willHaveKey = newKey ? true : Boolean(existing?.aiApiKeyEnc);
  if (d.enabled && !willHaveKey) {
    return { ok: false, error: "Add an API key before enabling AI." };
  }

  const data = {
    aiEnabled: d.enabled,
    aiProvider: d.provider,
    aiModel: d.model && d.model.trim() ? d.model.trim() : null,
    aiGuidance: d.guidance && d.guidance.trim() ? d.guidance.trim() : null,
    ...(newKey ? { aiApiKeyEnc: encryptWithSecret(newKey, env.BETTER_AUTH_SECRET) } : {}),
  };

  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
  revalidatePath("/admin/ai");
  return { ok: true };
}

/** Run the saved AI config against sample data; surfaces latency + any error. */
export async function testAi(): Promise<{ ok: boolean; ms: number; text?: string; error?: string }> {
  await requireSuperAdmin();
  return testStatement();
}
