"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  qualificationSchema,
  disqualifiedContentSchema,
  type QualificationInput,
  type DisqualifiedContentInput,
} from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { assertEdit } from "@/lib/tenant/acting";

/** Save the Page-1 qualification gate config for an assessment. */
export async function saveQualification(
  assessmentId: string,
  input: QualificationInput,
): Promise<ActionResult> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  const denied = await assertEdit();
  if (denied) return denied;
  const parsed = qualificationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { qualification: parsed.data as unknown as Prisma.InputJsonValue },
  });
  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true };
}

/** Save the disqualified-page content for an assessment. */
export async function saveDisqualifiedContent(
  assessmentId: string,
  input: DisqualifiedContentInput,
): Promise<ActionResult> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  const denied = await assertEdit();
  if (denied) return denied;
  const parsed = disqualifiedContentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { disqualifiedContent: parsed.data as unknown as Prisma.InputJsonValue },
  });
  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { ok: true };
}
