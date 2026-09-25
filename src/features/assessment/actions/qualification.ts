"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  qualificationSchema,
  disqualifiedContentSchema,
  isQualificationActive,
  type QualificationInput,
  type DisqualifiedContentInput,
} from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { assertEdit, resolveActingScope } from "@/lib/tenant/acting";
import { tenantCan } from "@/lib/billing/entitlements";

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

  // Billing gate: the pre-assessment qualification / disqualify gate is a Growth+
  // capability. TURNING IT ON needs the feature; saving an inactive/cleared config
  // (to turn it off) is always allowed. The app owner (super admin) is never limited.
  if (isQualificationActive(parsed.data)) {
    const scope = await resolveActingScope();
    if (!scope.isSuper && !(await tenantCan(scope.tenantId, "qualificationGate"))) {
      return { ok: false, error: "The qualification gate is available on the Growth plan and up. Upgrade to enable it." };
    }
  }

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
