import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  PROMPT_VERSIONS,
  PREVIEW_SAMPLE,
  getPromptVersion,
  instructionVersion,
  type PromptVersion,
} from "@/lib/ai/prompt-versions";
import { buildStatementMessages } from "@/lib/ai/prompt";

/**
 * Resolve a version id to a PromptVersion, scoped to a tenant. Built-in code
 * versions (v1/v2) win by id; otherwise the tenant's stored AiPromptVersion row is
 * wrapped via instructionVersion(); a missing/blank id falls back to the default.
 */
export async function resolvePromptVersion(
  versionId: string | null | undefined,
  tenantId: string | null,
): Promise<PromptVersion> {
  const code = versionId ? PROMPT_VERSIONS.find((v) => v.id === versionId) : undefined;
  if (code) return code;
  if (versionId) {
    const row = await prisma.aiPromptVersion.findFirst({
      where: { id: versionId, tenantId },
      select: { id: true, label: true, instructions: true },
    });
    if (row) return instructionVersion(row);
  }
  return getPromptVersion(versionId);
}

/** The tenant's word-count window (assembled prompts ask the model for this range). */
export async function getWordWindow(tenantId: string | null): Promise<{ min: number; max: number }> {
  const s = tenantId
    ? await prisma.appSetting.findUnique({ where: { tenantId }, select: { aiWordMin: true, aiWordMax: true } })
    : await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { aiWordMin: true, aiWordMax: true } });
  return { min: s?.aiWordMin ?? 200, max: s?.aiWordMax ?? 280 };
}

export interface PromptVersionRow {
  id: string;
  /** V3, V4, … for tenant versions; null for the two built-in code versions. */
  number: number | null;
  label: string;
  description: string;
  builtin: boolean;
  /** The owner's editable text ("" for built-ins, which are code). */
  instructions: string;
  /** The full assembled system prompt against the sample (what the model receives). */
  system: string;
}

/** Every version available to a tenant: the two built-ins (read-only) + the tenant's
 *  own instruction versions (V3+), each with its assembled system prompt for preview. */
export async function listPromptVersions(tenantId: string | null): Promise<PromptVersionRow[]> {
  const words = await getWordWindow(tenantId);
  // Newest first, so a version the owner just added is at the TOP of the list.
  const rows = await prisma.aiPromptVersion.findMany({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { id: true, number: true, label: true, instructions: true },
  });
  const builtins: PromptVersionRow[] = PROMPT_VERSIONS.map((v) => ({
    id: v.id,
    number: null,
    label: v.label,
    description: v.description,
    builtin: true,
    instructions: "",
    system: buildStatementMessages(PREVIEW_SAMPLE, v, words).system,
  }));
  const custom: PromptVersionRow[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    label: r.label,
    description: "Your custom instructions.",
    builtin: false,
    instructions: r.instructions,
    system: buildStatementMessages(PREVIEW_SAMPLE, instructionVersion(r), words).system,
  }));
  // Owner's own versions first (newest at top), built-in references last.
  return [...custom, ...builtins];
}

/** The next tenant version number (built-ins occupy 1–2, so tenant versions start at 3). */
export async function nextVersionNumber(tenantId: string | null): Promise<number> {
  const max = await prisma.aiPromptVersion.aggregate({ where: { tenantId }, _max: { number: true } });
  return Math.max(2, max._max.number ?? 2) + 1;
}
