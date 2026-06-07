"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { questionSchema, reorderSchema, type QuestionInput } from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";

async function assessmentIdForCategory(categoryId: string): Promise<string | null> {
  const c = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { assessmentId: true },
  });
  return c?.assessmentId ?? null;
}

export async function createQuestion(
  categoryId: string,
  input: QuestionInput,
): Promise<ActionResult<{ id: string }>> {
  await requireSuperAdmin();
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const assessmentId = await assessmentIdForCategory(categoryId);
  if (!assessmentId) return { ok: false, error: "Category not found." };

  const count = await prisma.question.count({ where: { categoryId } });
  const created = await prisma.question.create({
    data: {
      categoryId,
      text: d.text,
      weight: d.weight,
      required: d.required,
      displayOrder: count,
      options: {
        create: d.options.map((o, index) => ({
          label: o.label,
          value: o.value,
          displayOrder: index,
        })),
      },
    },
  });

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true, data: { id: created.id } };
}

export async function updateQuestion(
  id: string,
  input: QuestionInput,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const question = await prisma.question.findUnique({
    where: { id },
    select: { category: { select: { assessmentId: true } } },
  });
  if (!question) return { ok: false, error: "Question not found." };

  // Replace options wholesale (simplest correct approach for MVP).
  await prisma.$transaction([
    prisma.option.deleteMany({ where: { questionId: id } }),
    prisma.question.update({
      where: { id },
      data: {
        text: d.text,
        weight: d.weight,
        required: d.required,
        options: {
          create: d.options.map((o, index) => ({
            label: o.label,
            value: o.value,
            displayOrder: index,
          })),
        },
      },
    }),
  ]);

  revalidatePath(`/admin/assessments/${question.category.assessmentId}`);
  return { ok: true };
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const question = await prisma.question.findUnique({
    where: { id },
    select: { category: { select: { assessmentId: true } } },
  });
  if (!question) return { ok: false, error: "Question not found." };

  await prisma.question.delete({ where: { id } });
  revalidatePath(`/admin/assessments/${question.category.assessmentId}`);
  return { ok: true };
}

export async function reorderQuestions(
  categoryId: string,
  ids: string[],
): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = reorderSchema.safeParse({ ids });
  if (!parsed.success) return { ok: false, error: "Invalid order." };

  const assessmentId = await assessmentIdForCategory(categoryId);
  await prisma.$transaction(
    parsed.data.ids.map((id, index) =>
      prisma.question.update({ where: { id }, data: { displayOrder: index } }),
    ),
  );

  if (assessmentId) revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true };
}
