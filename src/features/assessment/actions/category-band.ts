"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { categoryBandSchema, type CategoryBandInput } from "@/features/assessment/schemas";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { assertEdit } from "@/lib/tenant/acting";

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
