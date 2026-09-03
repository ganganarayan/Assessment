"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { questionSchema, reorderSchema, type QuestionInput } from "@/features/assessment/schemas";
import { type ActionResult, type OptionSnapshot } from "@/features/assessment/actions/shared";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { assertEdit } from "@/lib/tenant/acting";
import { isClinicRole, isClinicUnit } from "@/lib/scoring/clinic-audit";

/** Clinic-audit role: keep only a valid role, else null (GENERIC questions store null). */
function cleanRole(role: string | undefined): string | null {
  const r = (role ?? "").trim();
  return isClinicRole(r) ? r : null;
}
/** Clinic-audit unit: keep only a valid unit, else null (= the role's default). */
function cleanUnit(unit: string | undefined): string | null {
  const u = (unit ?? "").trim();
  return isClinicUnit(u) ? u : null;
}
/** Clinic-audit per-option extras, normalized for persistence. */
function optionExtras(o: { diagnosisClause?: string; isAssumption?: boolean }) {
  return { diagnosisClause: (o.diagnosisClause ?? "").trim() || null, isAssumption: o.isAssumption ?? false };
}

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
  const denied = await assertEdit();
  if (denied) return denied;

  const count = await prisma.question.count({ where: { categoryId } });
  const created = await prisma.question.create({
    data: {
      categoryId,
      text: d.text,
      weight: d.weight,
      required: d.required,
      scoringRole: cleanRole(d.scoringRole),
      scoringUnit: cleanUnit(d.scoringUnit),
      displayOrder: count,
      options: {
        create: d.options.map((o, index) => ({
          label: o.label,
          value: o.value,
          displayOrder: index,
          ...optionExtras(o),
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
  const denied = await assertEdit();
  if (denied) return denied;

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
          data: { label: o.label, value: o.value, displayOrder: index, ...optionExtras(o) },
        }),
      );
    } else {
      ops.push(
        prisma.option.create({
          data: { questionId: id, label: o.label, value: o.value, displayOrder: index, ...optionExtras(o) },
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
      data: {
        text: d.text,
        weight: d.weight,
        required: d.required,
        scoringRole: cleanRole(d.scoringRole),
        scoringUnit: cleanUnit(d.scoringUnit),
      },
    }),
  );
  await prisma.$transaction(ops);

  revalidatePath(`/admin/assessments/${question.category.assessmentId}`);
  return { ok: true };
}

/**
 * Copy ONE question's option scale (labels + point values) onto every OTHER
 * question in the same assessment. Overwrites matching positions in place only —
 * it never adds or removes options, so option ids (and past respondents' answers)
 * stay intact; a target with a different option count keeps its own count, with
 * just the overlapping rows relabelled. Clinic per-option extras (diagnosis
 * clause / "don't know") are left untouched. Edit-guarded + scope-checked.
 */
export async function copyOptionsToAll(
  sourceQuestionId: string,
): Promise<ActionResult<{ count: number; prev: OptionSnapshot[] }>> {
  const source = await prisma.question.findUnique({
    where: { id: sourceQuestionId },
    select: {
      category: { select: { assessmentId: true } },
      options: { orderBy: { displayOrder: "asc" }, select: { label: true, value: true } },
    },
  });
  if (!source) return { ok: false, error: "Question not found." };
  const assessmentId = source.category.assessmentId;
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  const denied = await assertEdit();
  if (denied) return denied;

  const targets = await prisma.question.findMany({
    where: { category: { assessmentId }, id: { not: sourceQuestionId } },
    select: {
      id: true,
      options: { orderBy: { displayOrder: "asc" }, select: { id: true, label: true, value: true } },
    },
  });

  const prev: OptionSnapshot[] = [];
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const t of targets) {
    const n = Math.min(source.options.length, t.options.length);
    for (let i = 0; i < n; i++) {
      const o = t.options[i]!;
      // Snapshot the pre-overwrite value so Revert can restore it exactly (per row).
      prev.push({ questionId: t.id, id: o.id, label: o.label, value: o.value });
      ops.push(
        prisma.option.update({
          where: { id: o.id },
          data: { label: source.options[i]!.label, value: source.options[i]!.value },
        }),
      );
    }
  }
  if (ops.length > 0) await prisma.$transaction(ops);

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true, data: { count: targets.length, prev } };
}

/** Restore a set of options to a prior snapshot — the Revert for copyOptionsToAll. */
export async function restoreOptions(
  snapshot: OptionSnapshot[],
): Promise<ActionResult> {
  const clean = (snapshot ?? []).filter((s) => s && typeof s.id === "string" && s.id.length > 0);
  if (clean.length === 0) return { ok: true };

  // Authorize via the assessment that owns these options (all from one copy, so one
  // assessment). Reject if the first option can't be traced to an in-scope assessment.
  const first = await prisma.option.findUnique({
    where: { id: clean[0]!.id },
    select: { question: { select: { category: { select: { assessmentId: true } } } } },
  });
  const assessmentId = first?.question.category.assessmentId;
  if (!assessmentId || !(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  const denied = await assertEdit();
  if (denied) return denied;

  await prisma.$transaction(
    clean.map((s) =>
      prisma.option.update({ where: { id: s.id }, data: { label: s.label, value: s.value } }),
    ),
  );
  revalidatePath(`/admin/assessments/${assessmentId}`);
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
  const denied = await assertEdit();
  if (denied) return denied;

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
  const denied = await assertEdit();
  if (denied) return denied;

  await prisma.$transaction(
    // Constrain to THIS category so foreign ids match nothing (no cross-tenant reorder).
    parsed.data.ids.map((id, index) =>
      prisma.question.updateMany({ where: { id, categoryId }, data: { displayOrder: index } }),
    ),
  );

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true };
}
