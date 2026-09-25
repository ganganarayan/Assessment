"use server";

import { revalidatePath } from "next/cache";
import { BandLevel } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope, scopeEditDenied } from "@/lib/tenant/acting";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { parseAssessmentText, analyzeBands, type OverallLevel } from "@/lib/import/parse-assessment-text";

/** Slugify a title the same way the rest of the app does (self-provision/platform). */
function slugify(seed: string): string {
  return seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/** A free (globally-unique) slug based on the title, suffixing -2, -3… as needed. */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "assessment";
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.assessment.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/* ------------------------------------------------------- step 1: preview --- */

export interface ImportTextPreview {
  title: string;
  slug: string;
  categories: number;
  questions: number;
  options: number;
  categoryBands: number;
  overallBands: number;
  errors: string[];
  warnings: string[];
}

/** Parse + validate pasted text and return a preview (no writes). Only the
 *  assessment STRUCTURE can error here; band issues surface as warnings (they're
 *  edited + validated in step 2). */
export async function previewAssessmentText(text: string): Promise<ActionResult<ImportTextPreview>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const { draft, errors, warnings } = parseAssessmentText(text);
  const categories = draft?.categories ?? [];
  const questions = categories.reduce((n, c) => n + c.questions.length, 0);
  const options = categories.reduce((n, c) => n + c.questions.reduce((m, q) => m + q.options.length, 0), 0);
  const categoryBands = categories.reduce((n, c) => n + c.bands.length, 0);

  return {
    ok: true,
    data: {
      title: draft?.title ?? "",
      slug: draft ? await uniqueSlug(draft.title) : "",
      categories: categories.length,
      questions,
      options,
      categoryBands,
      overallBands: draft?.overallBands.length ?? 0,
      errors,
      warnings,
    },
  };
}

/* -------------------------------------- step 1: create assessment (only) --- */

export interface SuggestedOverallBand {
  level: OverallLevel;
  min: number;
  max: number;
  title: string;
  description: string;
}
export interface SuggestedCategoryBand {
  min: number;
  max: number;
  label: string;
  meaning: string;
}
export interface SuggestedCategory {
  categoryId: string;
  name: string;
  bands: SuggestedCategoryBand[];
}
export interface CreatedFromText {
  id: string;
  slug: string;
  /** Bands parsed from the text — SUGGESTIONS only, edited + imported in step 2. */
  overallBands: SuggestedOverallBand[];
  categories: SuggestedCategory[];
}

/**
 * STEP 1 — create the assessment STRUCTURE (categories → questions → options)
 * from pasted text. NO bands are written here; the parsed bands are returned as
 * editable suggestions for step 2 (importBandsForAssessment).
 */
export async function createAssessmentFromText(text: string): Promise<ActionResult<CreatedFromText>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };

  // Billing gate — an import is a new assessment, so it counts against the cap.
  if (!scope.isSuper) {
    const cap = await assertCanCreateAssessment(scope.tenantId);
    if (!cap.ok) {
      return {
        ok: false,
        error: `You've reached your plan's limit of ${cap.limit} assessment${cap.limit === 1 ? "" : "s"}. Upgrade your plan to create more.`,
      };
    }
  }

  const { draft, errors } = parseAssessmentText(text);
  if (errors.length > 0 || !draft) {
    return { ok: false, error: errors[0] ?? "Could not parse the assessment." };
  }

  const slug = await uniqueSlug(draft.title);

  const created = await prisma.assessment.create({
    data: {
      title: draft.title,
      slug,
      description: draft.description,
      status: "DRAFT",
      engine: "GENERIC",
      ...(scope.user.id ? { createdBy: { connect: { id: scope.user.id } } } : {}),
      ...(scope.tenantId ? { tenant: { connect: { id: scope.tenantId } } } : {}),
      categories: {
        create: draft.categories.map((c, ci) => ({
          name: c.name,
          displayOrder: ci,
          page: 1,
          questions: {
            create: c.questions.map((q, qi) => ({
              text: q.text,
              weight: 1,
              required: true,
              displayOrder: qi,
              options: {
                create: q.options.map((o, oi) => ({ label: o.label, value: o.value, displayOrder: oi })),
              },
            })),
          },
        })),
      },
    },
    select: { id: true, slug: true },
  });

  // Categories were created in draft order — read them back (ordered) to attach the
  // band suggestions to their new ids for step 2.
  const cats = await prisma.category.findMany({
    where: { assessmentId: created.id },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true },
  });
  const categories: SuggestedCategory[] = cats.map((cat, i) => ({
    categoryId: cat.id,
    name: cat.name,
    bands: (draft.categories[i]?.bands ?? []).map((b) => ({
      min: b.min,
      max: b.max,
      label: b.label,
      meaning: b.meaning ?? "",
    })),
  }));

  const overallBands: SuggestedOverallBand[] = draft.overallBands.map((b) => ({
    level: b.level,
    min: b.min,
    max: b.max,
    title: b.title,
    description: b.description ?? "",
  }));

  revalidatePath("/admin/assessment-builder");
  revalidatePath("/admin/assessments");
  revalidatePath("/w/assessments");
  return { ok: true, data: { id: created.id, slug: created.slug, overallBands, categories } };
}

/* --------------------------------------------- step 2: import the bands --- */

export interface ImportBandsInput {
  assessmentId: string;
  overall: { level: string; min: number; max: number; title: string; description: string }[];
  categories: { categoryId: string; bands: { min: number; max: number; label: string; meaning: string }[] }[];
}

const LEVELS = new Set(Object.values(BandLevel) as string[]);

/**
 * STEP 2 — import the (edited) bands onto an assessment created in step 1.
 * Replaces any existing bands for that assessment + its categories, so it's safe
 * to re-run. Ranges are hard-validated here (overlap / 0–100) — errors block.
 */
export async function importBandsForAssessment(input: ImportBandsInput): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const assessment = await prisma.assessment.findFirst({
    where: { id: input.assessmentId, ...tenantScope(scope) },
    select: { id: true, categories: { select: { id: true } } },
  });
  if (!assessment) return { ok: false, error: "Assessment not found in your workspace." };
  const ownedCategoryIds = new Set(assessment.categories.map((c) => c.id));

  // Validate.
  const errors: string[] = [];
  for (const b of input.overall) {
    if (!LEVELS.has(b.level)) errors.push(`Overall band level "${b.level}" must be LOW/MEDIUM/HIGH/CRITICAL.`);
    if (!b.title.trim()) errors.push("Every overall band needs a title.");
  }
  errors.push(...analyzeBands(input.overall.map((b) => ({ min: b.min, max: b.max })), "Overall bands").errors);
  for (const c of input.categories) {
    if (!ownedCategoryIds.has(c.categoryId)) {
      errors.push("A category band targets a category outside this assessment.");
      continue;
    }
    if (c.bands.length === 0) continue;
    for (const b of c.bands) if (!b.label.trim()) errors.push("Every category band needs a label.");
    errors.push(...analyzeBands(c.bands.map((b) => ({ min: b.min, max: b.max })), "A category's bands").errors);
  }
  if (errors.length > 0) return { ok: false, error: errors[0]! };

  await prisma.$transaction(async (tx) => {
    // Replace existing bands (idempotent re-run).
    await tx.resultBand.deleteMany({ where: { assessmentId: assessment.id } });
    await tx.categoryResultBand.deleteMany({ where: { categoryId: { in: [...ownedCategoryIds] } } });

    if (input.overall.length > 0) {
      await tx.resultBand.createMany({
        data: input.overall.map((b, i) => ({
          assessmentId: assessment.id,
          level: b.level as BandLevel,
          title: b.title,
          description: b.description || null,
          minScore: b.min,
          maxScore: b.max,
          displayOrder: i,
        })),
      });
    }
    for (const c of input.categories) {
      if (c.bands.length === 0) continue;
      await tx.categoryResultBand.createMany({
        data: c.bands.map((b, i) => ({
          categoryId: c.categoryId,
          label: b.label,
          meaning: b.meaning || null,
          minScore: b.min,
          maxScore: b.max,
          displayOrder: i,
        })),
      });
    }
  });

  revalidatePath(`/admin/assessments/${assessment.id}`);
  return { ok: true };
}
