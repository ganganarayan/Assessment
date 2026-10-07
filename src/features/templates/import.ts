import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assessmentCreateData, generateCopySlug, slugExists } from "@/features/assessment/transfer/import";
import { nextVersionNumber } from "@/lib/ai/versions";
import { parseTemplateBody } from "@/features/templates/schema";

/**
 * Turn a Template row into a real assessment inside one workspace.
 *
 * Four things are forced, and each one is a mistake that would otherwise be made once
 * per import:
 *
 *  1. DRAFT. An imported funnel is somebody else's questions with somebody else's copy.
 *     It must never be reachable by a respondent before its new owner has read it.
 *     (`assessmentCreateData` already pins status; it is restated here as intent.)
 *  2. A globally unique slug. Assessment.slug is unique platform-wide, so two tenants
 *     importing "coach-fit" cannot both have it. generateCopySlug checks the real index.
 *  3. Meta OFF. fireMetaCapi is the master switch: a template arriving live would start
 *     feeding events into an ad account from a funnel nobody has reviewed. The template's
 *     per-event selection is kept, so switching the master on later does the right thing.
 *  4. Its own AI prompt. The template's suggested instructions become an AiPromptVersion
 *     OWNED BY THIS TENANT and are selected on the new assessment. A tenant cannot read
 *     the platform's built-in prompts (lib/ai/versions: a built-in id resolves to null
 *     for anyone else), so carrying an id instead of the text would import an assessment
 *     that generates nothing.
 *
 * `platformSignup` is forced off too: it mints logins on the SaaS itself, and while the
 * public flow already ignores it for a non-platform assessment, a template is not the
 * place to carry a flag that means "turn respondents into tenants".
 */

export interface TemplateImportResult {
  assessmentId: string;
  slug: string;
  /** The AI version created for this tenant, if the template suggested a prompt. */
  promptVersionLabel: string | null;
}

export async function importTemplateForTenant(args: {
  templateId: string;
  tenantId: string;
  userId: string | null;
  /** Visibility rule the caller already enforced; passed so this never has to guess. */
  allowPrivateOf?: string | null;
}): Promise<{ ok: true; data: TemplateImportResult } | { ok: false; error: string }> {
  const t = await prisma.template.findFirst({
    where: {
      id: args.templateId,
      OR: [
        { ownerTenantId: null, published: true, reviewStatus: "APPROVED" },
        ...(args.allowPrivateOf ? [{ ownerTenantId: args.allowPrivateOf }] : []),
      ],
    },
    select: { id: true, title: true, slug: true, body: true, aiInstructions: true },
  });
  if (!t) return { ok: false, error: "That template isn't available." };

  const parsed = parseTemplateBody(t.body);
  if (!parsed.success) {
    // Loud, and specific about WHOSE problem it is. A tenant cannot fix a malformed
    // template, so the message says to report it rather than suggesting they retry.
    return {
      ok: false,
      error: `This template is stored in a shape the importer can't read (${parsed.error.issues[0]?.message ?? "invalid"}). Please tell us - it needs fixing at our end.`,
    };
  }
  const body = parsed.data;

  // Base the assessment slug on the template's own, but never collide: an existing slug
  // sends it through the -copy / -copy-2 ladder, which checks the global unique index.
  const base = body.slug || t.slug;
  const slug = (await slugExists(base)) ? await generateCopySlug(base, new Set()) : base;

  const data = assessmentCreateData(body, slug, args.userId, args.tenantId);

  // The forced overrides. Applied AFTER the shared mapping so a new transfer field can
  // never quietly re-enable one of them.
  data.fireMetaCapi = false;
  data.platformSignup = false;
  data.status = "DRAFT";
  data.publishedAt = null;

  const instructions = t.aiInstructions?.trim() || "";

  // One transaction: an assessment with a prompt version that failed to write, or a
  // version pointing at an assessment that was rolled back, are both worse than no
  // import at all.
  const out = await prisma.$transaction(
    async (tx) => {
      let promptVersionLabel: string | null = null;
      let promptVersionId: string | null = null;

      if (instructions) {
        // Per-tenant numbering continues past the built-ins, same as the AI screen's
        // "new version" button - so an imported prompt looks like one the tenant made.
        const number = await nextVersionNumber(args.tenantId, tx);
        const label = `V${number} - ${t.title}`.slice(0, 120);
        const row = await tx.aiPromptVersion.create({
          data: { tenantId: args.tenantId, number, label, instructions },
          select: { id: true },
        });
        promptVersionId = row.id;
        promptVersionLabel = label;
      }

      const created = await tx.assessment.create({
        data: {
          ...data,
          ...(promptVersionId ? { aiPromptVersionId: promptVersionId } : {}),
          // No prompt suggested means the template ships without an AI statement; say
          // so on the assessment rather than leaving it on and generating from whatever
          // the workspace default happens to be.
          ...(instructions ? {} : { useAiStatement: false }),
        },
        select: { id: true, slug: true },
      });

      return { assessmentId: created.id, slug: created.slug, promptVersionLabel };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  return { ok: true, data: out };
}

/** The JSON value helper the seeder and the save-as-template path share. */
export const asTemplateJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
