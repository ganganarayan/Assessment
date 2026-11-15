"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope, scopeEditDenied } from "@/lib/tenant/acting";
import { invalidatePublicAssessmentById } from "@/features/assessment/data";
import { type ActionResult } from "@/features/assessment/actions/shared";

/** Switch this funnel's Meta reporting on or off (the pixel and Conversions API events: gate passed, turned away, registration, completion). A template arrives with it OFF on purpose, so an imported funnel reports nothing to Meta until this is switched on. Turn it on before testing a funnel that will run Meta ads; the ad account it reports to must hold a pixel id and CAPI token before publishing. Only this one switch changes. */
export async function setMetaReporting(assessmentId: string, on: boolean): Promise<ActionResult<{ fireMetaCapi: boolean }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const a = await prisma.assessment.findFirst({ where: { id: assessmentId, ...tenantScope(scope) }, select: { id: true } });
  if (!a) return { ok: false, error: "Not found." };
  await prisma.assessment.update({ where: { id: a.id }, data: { fireMetaCapi: on === true }, select: { id: true } });
  await invalidatePublicAssessmentById(a.id);
  revalidatePath(`/admin/assessments/${a.id}`);
  revalidatePath("/w/assessments");
  return { ok: true, data: { fireMetaCapi: on === true } };
}
