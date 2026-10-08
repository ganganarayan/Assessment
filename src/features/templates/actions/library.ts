"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PARKED_MESSAGE } from "@/lib/billing/plans";
import { buildAssessmentBody } from "@/features/assessment/transfer/export";
import { importTemplateForTenant } from "@/features/templates/import";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { type SaveAsTemplateResult } from "@/features/templates/types";
import { type TemplateImportResult } from "@/features/templates/import";

/**
 * The tenant half of the Template Library: importing one, and saving one back.
 *
 * Both run as the WORKSPACE, never globally. A super admin who has entered a workspace
 * acts as that workspace here, which is the point of entering it.
 */

/**
 * Import a template into this workspace as a new DRAFT assessment.
 *
 * The plan cap applies. An imported assessment is an assessment: it serves a funnel,
 * takes submissions and costs the same to run, so letting the library route around
 * `maxAssessments` would turn the cap into a suggestion. A super admin who has entered
 * a workspace is not rated against the plan, exactly as the Assessments screen already
 * treats them.
 */
export async function importTemplate(templateId: string): Promise<ActionResult<TemplateImportResult>> {
  const { user, tenantId, impersonating } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  if (!impersonating) {
    const plan = await resolvePlan(tenantId);
    if (plan.parked) return { ok: false, error: PARKED_MESSAGE };
    const cap = await assertCanCreateAssessment(tenantId);
    if (!cap.ok) {
      return {
        ok: false,
        error: `You've reached your plan's limit of ${cap.limit} assessment${cap.limit === 1 ? "" : "s"}. Upgrade your plan to import this.`,
      };
    }
  }

  const r = await importTemplateForTenant({
    templateId,
    tenantId,
    userId: user.id,
    allowPrivateOf: tenantId,
  });
  if (!r.ok) return r;

  revalidatePath("/w/assessments");
  revalidatePath("/w/dashboard");
  return { ok: true, data: r.data };
}

/** Work out which shape a funnel actually IS, rather than asking the tenant to classify
 *  their own assessment and getting it wrong. */
function shapeOf(body: { qualification?: unknown; categories: Array<{ questions: unknown[] }> }):
  | "GATE_ONLY"
  | "GATED_ASSESSMENT"
  | "UNGATED_ASSESSMENT" {
  const q = body.qualification as { enabled?: boolean; questions?: unknown[] } | null | undefined;
  const gated = q?.enabled === true && (q.questions?.length ?? 0) > 0;
  const questions = body.categories.reduce((n, c) => n + c.questions.length, 0);
  if (gated && questions === 0) return "GATE_ONLY";
  return gated ? "GATED_ASSESSMENT" : "UNGATED_ASSESSMENT";
}

/** A free template slug derived from the assessment's own. The library slug is separate
 *  from any assessment slug, so collisions here only ever involve other templates. */
async function freeTemplateSlug(base: string): Promise<string> {
  const stem = (base || "template").slice(0, 60);
  let candidate = stem;
  let n = 1;
  while (await prisma.template.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${stem}-${n}`;
    if (n > 200) return `${stem}-${Date.now()}`;
  }
  return candidate;
}

/**
 * Save one of this workspace's assessments as a template.
 *
 * `destination` is the whole decision and it is the tenant's to make:
 *   "private"    - theirs, listed only in their own workspace, never reviewed
 *   "contribute" - sent to the master library, PENDING, invisible to everyone else
 *                  until the platform owner approves it
 *
 * A contribution is never published by this action. That is deliberate: a tenant must
 * not be able to put content in front of every other tenant by pressing a button in
 * their own builder.
 */
export async function saveAsTemplate(
  assessmentId: string,
  input: {
    destination: "private" | "contribute";
    title: string;
    category: string;
    summary: string;
    /** Suggested result-statement instructions to carry with it. */
    aiInstructions: string;
  },
): Promise<ActionResult<SaveAsTemplateResult>> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const owned = await prisma.assessment.findFirst({
    where: { id: assessmentId, tenantId },
    select: { id: true, slug: true, title: true, aiPromptVersionId: true },
  });
  if (!owned) return { ok: false, error: "Not found." };

  const title = input.title.trim() || owned.title;
  const category = input.category.trim();
  if (!category) return { ok: false, error: "Pick a category - it is how people find it." };

  const body = await buildAssessmentBody(assessmentId);
  if (!body) return { ok: false, error: "Couldn't read that assessment." };
  if (body.categories.length === 0 && !body.qualification) {
    return { ok: false, error: "There is nothing in this assessment to save yet." };
  }

  const contribute = input.destination === "contribute";
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

  /**
   * The AI instructions to carry. Blank means "use whatever this assessment already
   * has", which is the normal case - nobody wants to retype their own prompt.
   *
   * 🔴 Resolved ONLY from an AiPromptVersion row owned by THIS tenant. The selection
   * may name a built-in code version instead, and those are the platform owner's own
   * work: a tenant cannot read them (lib/ai/scope: builtInPromptsAllowed), so carrying
   * their text into a template would hand the mechanism the product is sold on to every
   * workspace that imported it, through a button in the contributor's own builder.
   * A findFirst scoped by tenantId is what makes that impossible rather than unlikely.
   */
  let aiInstructions = input.aiInstructions.trim();
  if (!aiInstructions && owned.aiPromptVersionId) {
    const version = await prisma.aiPromptVersion.findFirst({
      where: { id: owned.aiPromptVersionId, tenantId },
      select: { instructions: true },
    });
    aiInstructions = version?.instructions?.trim() ?? "";
  }

  const row = await prisma.template.create({
    data: {
      slug: await freeTemplateSlug(owned.slug),
      title: title.slice(0, 160),
      category: category.slice(0, 80),
      summary: input.summary.trim().slice(0, 500) || null,
      shape: shapeOf(body),
      body: body as object,
      aiInstructions: aiInstructions.slice(0, 20000) || null,
      builtin: false,
      // Private rows carry an owner and are APPROVED by definition - there is nobody
      // to review something only its author can see. Contributions carry no owner,
      // arrive PENDING, and stay unpublished until the platform owner says otherwise.
      ownerTenantId: contribute ? null : tenantId,
      published: false,
      reviewStatus: contribute ? "PENDING" : "APPROVED",
      ...(contribute
        ? { contributorTenantId: tenantId, contributorName: tenant?.name ?? null, submittedAt: new Date() }
        : {}),
    },
    select: { id: true },
  });

  revalidatePath("/w/templates");
  revalidatePath("/w/dashboard");
  revalidatePath("/admin/templates");
  return { ok: true, data: { templateId: row.id, pending: contribute } };
}

/** Delete one of this workspace's OWN private templates, or withdraw a contribution
 *  that has not been reviewed yet. Never anything else. */
export async function deleteMyTemplate(id: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;
  const row = await prisma.template.findFirst({
    where: {
      id,
      OR: [
        { ownerTenantId: tenantId },
        // A submitted contribution is still theirs to take back while nobody has
        // ruled on it. Once it is approved it is in the library and withdrawing it
        // would break every workspace that has it on screen.
        { contributorTenantId: tenantId, reviewStatus: "PENDING", ownerTenantId: null },
      ],
    },
    select: { id: true },
  });
  if (!row) return { ok: false, error: "Not found." };
  await prisma.template.delete({ where: { id: row.id } });
  revalidatePath("/w/templates");
  revalidatePath("/w/dashboard");
  revalidatePath("/admin/templates");
  return { ok: true };
}
