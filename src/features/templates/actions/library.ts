"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, configTenantOf } from "@/lib/tenant/acting";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PARKED_MESSAGE } from "@/lib/billing/plans";
import { buildAssessmentBody } from "@/features/assessment/transfer/export";
import { importTemplateForTenant } from "@/features/templates/import";
import { assessmentCreateData } from "@/features/assessment/transfer/import";
import { parseTemplateBody } from "@/features/templates/schema";
import { nextVersionNumber } from "@/lib/ai/versions";
import { invalidatePublicAssessmentById } from "@/features/assessment/data";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { type SaveAsTemplateResult } from "@/features/templates/types";
import { type TemplateImportResult } from "@/features/templates/import";

/**
 * Importing a template, and saving one back.
 *
 * These resolve the ACTING SCOPE rather than demanding a tenant workspace, so one
 * implementation serves all three callers: a tenant admin in /w, a super admin who has
 * entered a workspace, and the platform owner on /admin with no workspace entered. The
 * first version called requireWorkspace(), which REDIRECTS a non-impersonating super
 * admin to /platform - so the moment the library appeared on the owner's own dashboard,
 * every Import button there would have bounced him out of the page he was standing on.
 *
 * configTenantOf() is what makes that safe: it returns a non-nullable owner id, the
 * Platform tenant for the owner's own scope, so an imported assessment is always
 * stamped with somebody rather than written unowned.
 */

/**
 * Import a template into the acting scope as a new DRAFT assessment.
 *
 * The plan cap applies to TENANTS. An imported assessment is an assessment: it serves a
 * funnel, takes submissions and costs the same to run, so letting the library route
 * around `maxAssessments` would turn the cap into a suggestion. A super admin is not
 * rated against a plan at all - on the platform scope or inside a workspace - exactly
 * as the Assessments screen already treats them.
 */
export async function importTemplate(templateId: string): Promise<ActionResult<TemplateImportResult>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const tenantId = configTenantOf(scope);

  if (!scope.isSuper) {
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
    userId: scope.user.id,
    allowPrivateOf: tenantId,
    // Only the owner may run an unreviewed template, and only because reviewing it is
    // the job. A tenant importing is still bound by published + approved.
    allowUnpublished: scope.isSuper,
  });
  if (!r.ok) return r;

  revalidatePath("/w/assessments");
  revalidatePath("/w/dashboard");
  revalidatePath("/admin");
  revalidatePath("/admin/assessments");
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
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const tenantId = configTenantOf(scope);

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
  revalidatePath("/admin");
  revalidatePath("/admin/templates");
  return { ok: true, data: { templateId: row.id, pending: contribute } };
}

/** Delete one of this workspace's OWN private templates, or withdraw a contribution
 *  that has not been reviewed yet. Never anything else. */
export async function deleteMyTemplate(id: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const tenantId = configTenantOf(scope);
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
  revalidatePath("/admin");
  revalidatePath("/admin/templates");
  return { ok: true };
}

/**
 * Fill an EMPTY assessment from a template, in place.
 *
 * This is what "start from a template" has to mean inside a builder. The other
 * reading - import creates a separate draft - is what the Templates page already does,
 * and doing it from step 1 of an assessment you are editing would leave you with two
 * assessments and the wrong one open.
 *
 * 🔴 EMPTY ONLY, and that is the safety rather than a limitation. Filling an
 * assessment that already has questions means deleting them, and a template chosen by
 * mistake would take somebody's afternoon with it. An assessment with content is sent
 * to the Templates page instead, where importing makes a new draft and destroys
 * nothing. There is no confirm dialog here because there is nothing to confirm.
 *
 * The title and slug are KEPT. They are the two things somebody types before they get
 * here, the slug may already be linked from somewhere, and a template's own title is
 * a description of the template rather than a name for their funnel.
 */
export async function applyTemplateToAssessment(
  assessmentId: string,
  templateId: string,
): Promise<ActionResult<{ promptVersionLabel: string | null }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const tenantId = configTenantOf(scope);

  const target = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...(scope.isSuper && !scope.tenantId ? {} : { tenantId }) },
    select: {
      id: true,
      title: true,
      slug: true,
      qualification: true,
      _count: { select: { categories: true, resultBands: true } },
    },
  });
  if (!target) return { ok: false, error: "Not found." };

  const gate = target.qualification as { questions?: unknown[] } | null;
  const hasContent =
    target._count.categories > 0 ||
    target._count.resultBands > 0 ||
    (Array.isArray(gate?.questions) && gate.questions.length > 0);
  if (hasContent) {
    return {
      ok: false,
      error:
        "This assessment already has questions, so a template can't be laid over it. Import the template from the Templates page instead - that makes a new draft and leaves this one alone.",
    };
  }

  const t = await prisma.template.findFirst({
    where: {
      id: templateId,
      ...(scope.isSuper
        ? {}
        : {
            OR: [
              { ownerTenantId: null, published: true, reviewStatus: "APPROVED" },
              { ownerTenantId: tenantId },
            ],
          }),
    },
    select: { id: true, title: true, body: true, aiInstructions: true },
  });
  if (!t) return { ok: false, error: "That template isn't available." };

  const parsed = parseTemplateBody(t.body);
  if (!parsed.success) {
    return { ok: false, error: "This template is stored in a shape the builder can't read. Please tell us." };
  }

  // Reuse the ONE create mapping, then drop what belongs to the row rather than to
  // the template: its identity, its owner, and the name its owner gave it.
  const data = assessmentCreateData(parsed.data, target.slug, null, null);
  delete (data as { slug?: unknown }).slug;
  delete (data as { title?: unknown }).title;
  delete (data as { tenant?: unknown }).tenant;
  delete (data as { createdBy?: unknown }).createdBy;
  data.fireMetaCapi = false;
  data.platformSignup = false;
  data.status = "DRAFT";
  data.publishedAt = null;

  const instructions = t.aiInstructions?.trim() || "";

  const out = await prisma.$transaction(
    async (tx) => {
      let promptVersionLabel: string | null = null;
      let promptVersionId: string | null = null;
      if (instructions) {
        const number = await nextVersionNumber(tenantId, tx);
        const label = `V${number} - ${t.title}`.slice(0, 120);
        const row = await tx.aiPromptVersion.create({
          data: { tenantId, number, label, instructions },
          select: { id: true },
        });
        promptVersionId = row.id;
        promptVersionLabel = label;
      }
      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          ...data,
          ...(promptVersionId ? { aiPromptVersionId: promptVersionId } : { useAiStatement: false }),
        },
      });
      return { promptVersionLabel };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  await invalidatePublicAssessmentById(assessmentId);
  revalidatePath("/admin/assessments");
  revalidatePath("/w/assessments");
  return { ok: true, data: out };
}
