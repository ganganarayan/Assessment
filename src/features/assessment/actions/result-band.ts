"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { resultBandSchema, type ResultBandInput } from "@/features/assessment/schemas";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";

export async function createResultBand(
  assessmentId: string,
  input: ResultBandInput,
): Promise<ActionResult<{ id: string }>> {
  await requireSuperAdmin();
  const parsed = resultBandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const count = await prisma.resultBand.count({ where: { assessmentId } });
  const created = await prisma.resultBand.create({
    data: {
      assessmentId,
      level: d.level,
      title: d.title,
      description: nullifyEmpty(d.description),
      minScore: d.minScore,
      maxScore: d.maxScore,
      displayOrder: count,
    },
  });

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true, data: { id: created.id } };
}

export async function updateResultBand(
  id: string,
  input: ResultBandInput,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = resultBandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const band = await prisma.resultBand.update({
    where: { id },
    data: {
      level: d.level,
      title: d.title,
      description: nullifyEmpty(d.description),
      minScore: d.minScore,
      maxScore: d.maxScore,
    },
    select: { assessmentId: true },
  });

  revalidatePath(`/admin/assessments/${band.assessmentId}`);
  return { ok: true };
}

export async function deleteResultBand(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const band = await prisma.resultBand.delete({
    where: { id },
    select: { assessmentId: true },
  });
  revalidatePath(`/admin/assessments/${band.assessmentId}`);
  return { ok: true };
}
