import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  PROMPT_VERSIONS,
  PREVIEW_SAMPLE,
  NEUTRAL_SAMPLE,
  getPromptVersion,
  instructionVersion,
  type PromptVersion,
} from "@/lib/ai/prompt-versions";
import { buildStatementMessages } from "@/lib/ai/prompt";
import { builtInPromptsAllowed } from "@/lib/ai/scope";
import { appSettingWhere } from "@/lib/settings/tenant-row";

/**
 * Resolve a version id to a PromptVersion, scoped to a tenant.
 *
 * The built-in code versions resolve ONLY for the scopes that own them (the platform
 * and the owner's own businesses). For anyone else a built-in id resolves to NOTHING
 * rather than to the owner's prompt: a tenant must not generate with instructions
 * they cannot see, and inheriting the default silently would do exactly that on every
 * workspace that never picked a version.
 *
 * Null means "no version": the caller skips generation and the result renders without
 * an AI message, which is the same fail-soft path as an unconfigured provider.
 */
export async function resolvePromptVersion(
  versionId: string | null | undefined,
  tenantId: string | null,
): Promise<PromptVersion | null> {
  const allowBuiltins = await builtInPromptsAllowed(tenantId);
  const code = versionId ? PROMPT_VERSIONS.find((v) => v.id === versionId) : undefined;
  if (code) return allowBuiltins ? code : null;
  if (versionId) {
    const row = await prisma.aiPromptVersion.findFirst({
      where: { id: versionId, tenantId },
      select: { id: true, label: true, instructions: true },
    });
    if (row) return instructionVersion(row);
  }
  return allowBuiltins ? getPromptVersion(versionId) : null;
}

/** The tenant's word-count window (assembled prompts ask the model for this range). */
export async function getWordWindow(tenantId: string | null): Promise<{ min: number; max: number }> {
  const s = await prisma.appSetting.findUnique({
    where: appSettingWhere(tenantId) as never,
    select: { aiWordMin: true, aiWordMax: true },
  });
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

/**
 * Every version this scope may see: its own instruction versions, plus the built-in
 * references ONLY where they belong (the platform and the owner's own businesses -
 * see builtInPromptsAllowed). A customer tenant gets its own versions and nothing
 * else, previewed against a neutral sample rather than the owner's assessment.
 */
export async function listPromptVersions(tenantId: string | null): Promise<PromptVersionRow[]> {
  const [words, allowBuiltins] = await Promise.all([
    getWordWindow(tenantId),
    builtInPromptsAllowed(tenantId),
  ]);
  const sample = allowBuiltins ? PREVIEW_SAMPLE : NEUTRAL_SAMPLE;
  // Newest first, so a version the owner just added is at the TOP of the list.
  const rows = await prisma.aiPromptVersion.findMany({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { id: true, number: true, label: true, instructions: true },
  });
  const builtins: PromptVersionRow[] = allowBuiltins
    ? PROMPT_VERSIONS.map((v) => ({
        id: v.id,
        number: null,
        label: v.label,
        description: v.description,
        builtin: true,
        instructions: "",
        system: buildStatementMessages(sample, v, words).system,
      }))
    : [];
  const custom: PromptVersionRow[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    label: r.label,
    description: "Your custom instructions.",
    builtin: false,
    instructions: r.instructions,
    system: buildStatementMessages(sample, instructionVersion(r), words).system,
  }));
  // Owner's own versions first (newest at top), built-in references last.
  return [...custom, ...builtins];
}

/**
 * The next version number for this scope.
 *
 * Where the built-ins are visible they occupy 1 and 2, so the owner's own versions
 * start at 3 and the labels on screen stay in order. A customer tenant never sees
 * them, so numbering from 3 would look like two versions had been deleted - theirs
 * start at 1. Existing rows always win (max + 1), so no tenant's numbering shifts.
 */
/** `client` lets a caller inside a transaction read the max through the SAME
 *  transaction, so two concurrent imports cannot both pick the same number and trip
 *  the (tenantId, number) unique index. The settings read stays on the base client:
 *  it is config, not part of the write. */
export async function nextVersionNumber(
  tenantId: string | null,
  client: Pick<typeof prisma, "aiPromptVersion"> = prisma,
): Promise<number> {
  const [max, allowBuiltins] = await Promise.all([
    client.aiPromptVersion.aggregate({ where: { tenantId }, _max: { number: true } }),
    builtInPromptsAllowed(tenantId),
  ]);
  const floor = allowBuiltins ? 2 : 0;
  return Math.max(floor, max._max.number ?? floor) + 1;
}
