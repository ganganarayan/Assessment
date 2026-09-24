"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { categoryBandSchema, type CategoryBandInput } from "@/features/assessment/schemas";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { assertEdit } from "@/lib/tenant/acting";
import { parseCompactBands } from "@/lib/import/parse-bands-text";

/**
 * Per-category evaluation bands (CategoryResultBand). The chosen LEVEL is stored
 * as the band `label` (what the destination page shows as the category band);
 * the suggestion is stored as `meaning`. Ranges must not overlap within a
 * category. Mirrors actions/result-band.ts. Super-admin only.
 */

async function assessmentIdForCategory(categoryId: string): Promise<string | null> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { assessmentId: true },
  });
  return cat?.assessmentId ?? null;
}

export async function createCategoryBand(
  input: CategoryBandInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = categoryBandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const assessmentId = await assessmentIdForCategory(d.categoryId);
  if (!assessmentId) return { ok: false, error: "Category not found." };
  if (!(await assessmentInScope(assessmentId))) {
    return { ok: false, error: "Not found." };
  }
  const denied = await assertEdit();
  if (denied) return denied;

  // One band per level per category.
  const dupLevel = await prisma.categoryResultBand.findFirst({
    where: { categoryId: d.categoryId, label: d.level },
    select: { id: true },
  });
  if (dupLevel) {
    return { ok: false, error: `Level ${d.level} is already set for this category.` };
  }

  const others = await prisma.categoryResultBand.findMany({
    where: { categoryId: d.categoryId },
    select: { minScore: true, maxScore: true },
  });
  if (others.some((b) => d.minScore <= b.maxScore && d.maxScore >= b.minScore)) {
    return { ok: false, error: "This range overlaps an existing band for this category." };
  }

  const count = await prisma.categoryResultBand.count({ where: { categoryId: d.categoryId } });
  const created = await prisma.categoryResultBand.create({
    data: {
      categoryId: d.categoryId,
      label: d.level,
      meaning: nullifyEmpty(d.suggestion),
      minScore: d.minScore,
      maxScore: d.maxScore,
      displayOrder: count,
    },
    select: { id: true },
  });

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true, data: { id: created.id } };
}

/**
 * Bulk-fill per-category evaluation bands from a compact text spec (ranges + names).
 * Category bands are capped at 4 (one per LEVEL), so at most 4 ranges: level is the
 * band's LABEL (auto LOW→CRITICAL) and the name becomes its suggestion (meaning).
 * REPLACES the bands for the target category, or for ALL categories at once.
 */
export async function importCategoryBandsFromText(
  assessmentId: string,
  text: string,
  target: "ALL" | string,
): Promise<ActionResult<{ categories: number; bandsPerCategory: number }>> {
  if (!(await assessmentInScope(assessmentId))) {
    return { ok: false, error: "Not found." };
  }
  const denied = await assertEdit();
  if (denied) return denied;

  const { bands, errors } = parseCompactBands(text);
  if (errors.length > 0) return { ok: false, error: errors[0]! };
  if (bands.length === 0) return { ok: false, error: "No bands found in the text." };
  if (bands.length > 4) {
    return { ok: false, error: "Category bands support up to 4 ranges (one per level). Use 4 or fewer." };
  }

  const cats = await prisma.category.findMany({ where: { assessmentId }, select: { id: true } });
  const catIds = target === "ALL" ? cats.map((c) => c.id) : cats.filter((c) => c.id === target).map((c) => c.id);
  if (catIds.length === 0) return { ok: false, error: "No matching category in this assessment." };

  await prisma.$transaction(async (tx) => {
    for (const cid of catIds) {
      await tx.categoryResultBand.deleteMany({ where: { categoryId: cid } });
      await tx.categoryResultBand.createMany({
        data: bands.map((b, i) => ({
          categoryId: cid,
          label: b.level, // level is the category band's label (unique per category)
          meaning: b.title || null, // the name becomes the per-category suggestion
          minScore: b.min,
          maxScore: b.max,
          displayOrder: i,
        })),
      });
    }
  });

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true, data: { categories: catIds.length, bandsPerCategory: bands.length } };
}

export async function updateCategoryBand(
  id: string,
  input: CategoryBandInput,
): Promise<ActionResult> {
  const parsed = categoryBandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const current = await prisma.categoryResultBand.findUnique({
    where: { id },
    select: { categoryId: true },
  });
  if (!current) return { ok: false, error: "Band not found." };
  const ownAId = await assessmentIdForCategory(current.categoryId);
  if (!ownAId || !(await assessmentInScope(ownAId))) {
    return { ok: false, error: "Not found." };
  }
  const denied = await assertEdit();
  if (denied) return denied;

  // One band per level per category (excluding this band).
  const dupLevel = await prisma.categoryResultBand.findFirst({
    where: { categoryId: current.categoryId, label: d.level, NOT: { id } },
    select: { id: true },
  });
  if (dupLevel) {
    return { ok: false, error: `Level ${d.level} is already set for this category.` };
  }

  const others = await prisma.categoryResultBand.findMany({
    where: { categoryId: current.categoryId, NOT: { id } },
    select: { minScore: true, maxScore: true },
  });
  if (others.some((b) => d.minScore <= b.maxScore && d.maxScore >= b.minScore)) {
    return { ok: false, error: "This range overlaps an existing band for this category." };
  }

  await prisma.categoryResultBand.update({
    where: { id },
    data: {
      label: d.level,
      meaning: nullifyEmpty(d.suggestion),
      minScore: d.minScore,
      maxScore: d.maxScore,
    },
  });

  const assessmentId = await assessmentIdForCategory(current.categoryId);
  if (assessmentId) revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true };
}

export async function deleteCategoryBand(id: string): Promise<ActionResult> {
  const current = await prisma.categoryResultBand.findUnique({
    where: { id },
    select: { categoryId: true },
  });
  if (!current) return { ok: false, error: "Band not found." };
  const assessmentId = await assessmentIdForCategory(current.categoryId);
  if (!assessmentId || !(await assessmentInScope(assessmentId))) {
    return { ok: false, error: "Not found." };
  }
  const denied = await assertEdit();
  if (denied) return denied;
  await prisma.categoryResultBand.delete({ where: { id } });
  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true };
}
