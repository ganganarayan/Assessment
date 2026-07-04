"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { questionSchema, reorderSchema, type QuestionInput } from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { assessmentInScope } from "@/features/assessment/actions/ownership";

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
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const assessmentId = await assessmentIdForCategory(categoryId);
  if (!assessmentId) return { ok: false, error: "Category not found." };
  if (!(await assessmentInScope(assessmentId))) {
    return { ok: false, error: "Not found." };
  }

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
  if (!(await assessmentInScope(question.category.assessmentId))) {
    return { ok: false, error: "Not found." };
  }

  // Reconcile options IN PLACE — never wholesale-delete. Past respondents'
  // answers (SubmissionAnswer) reference Option rows with onDelete: Cascade, so
  // deleting an option silently destroys every historical answer to this question
  // (the score snapshot is denormalized so totals survive, but the per-question
  // answer record is lost). Updating existing options by position preserves their
  // ids, so historical answers stay intact. Editing an option's value only
  // affects FUTURE submissions; past answers keep their stored value.
  const existing = await prisma.option.findMany({
    where: { questionId: id },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  d.options.forEach((o, index) => {
    const ex = existing[index];
    if (ex) {
      ops.push(
        prisma.option.update({
          where: { id: ex.id },
          data: { label: o.label, value: o.value, displayOrder: index },
        }),
      );
    } else {
      ops.push(
        prisma.option.create({
          data: { questionId: id, label: o.label, value: o.value, displayOrder: index },
        }),
      );
    }
  });
  // Only remove genuinely surplus options (when the count was reduced).
  if (existing.length > d.options.length) {
    const surplus = existing.slice(d.options.length).map((e) => e.id);
    ops.push(prisma.option.deleteMany({ where: { id: { in: surplus } } }));
  }
  ops.push(
    prisma.question.update({
      where: { id },
      data: { text: d.text, weight: d.weight, required: d.required },
    }),
  );
  await prisma.$transaction(ops);

  revalidatePath(`/admin/assessments/${question.category.assessmentId}`);
  return { ok: true };
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const question = await prisma.question.findUnique({
    where: { id },
    select: { category: { select: { assessmentId: true } } },
  });
  if (!question) return { ok: false, error: "Question not found." };
  if (!(await assessmentInScope(question.category.assessmentId))) {
    return { ok: false, error: "Not found." };
  }

  await prisma.question.delete({ where: { id } });
  revalidatePath(`/admin/assessments/${question.category.assessmentId}`);
  return { ok: true };
}

export async function reorderQuestions(
  categoryId: string,
  ids: string[],
): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse({ ids });
  if (!parsed.success) return { ok: false, error: "Invalid order." };

  const assessmentId = await assessmentIdForCategory(categoryId);
  if (!assessmentId) return { ok: false, error: "Category not found." };
  if (!(await assessmentInScope(assessmentId))) {
    return { ok: false, error: "Not found." };
  }

  await prisma.$transaction(
    // Constrain to THIS category so foreign ids match nothing (no cross-tenant reorder).
    parsed.data.ids.map((id, index) =>
      prisma.question.updateMany({ where: { id, categoryId }, data: { displayOrder: index } }),
    ),
  );

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true };
}
