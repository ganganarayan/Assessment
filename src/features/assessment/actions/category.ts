"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { categorySchema, reorderSchema, type CategoryInput } from "@/features/assessment/schemas";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";

export async function createCategory(
  assessmentId: string,
  input: CategoryInput,
): Promise<ActionResult<{ id: string }>> {
  await requireSuperAdmin();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const count = await prisma.category.count({ where: { assessmentId } });
  const created = await prisma.category.create({
    data: {
      assessmentId,
      name: parsed.data.name,
      description: nullifyEmpty(parsed.data.description),
      displayOrder: count,
    },
  });

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true, data: { id: created.id } };
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: nullifyEmpty(parsed.data.description),
    },
    select: { assessmentId: true },
  });

  revalidatePath(`/admin/assessments/${category.assessmentId}`);
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const category = await prisma.category.delete({
    where: { id },
    select: { assessmentId: true },
  });
  revalidatePath(`/admin/assessments/${category.assessmentId}`);
  return { ok: true };
}

/** Persist a new category order (ids in desired order). DnD-ready. */
export async function reorderCategories(
  assessmentId: string,
  ids: string[],
): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = reorderSchema.safeParse({ ids });
  if (!parsed.success) return { ok: false, error: "Invalid order." };

  await prisma.$transaction(
    parsed.data.ids.map((id, index) =>
      prisma.category.update({
        where: { id },
        data: { displayOrder: index },
      }),
    ),
  );

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true };
}
