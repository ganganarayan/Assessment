import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope } from "@/lib/tenant/acting";

/**
 * Tenant-isolation gate for assessment-editing actions. Every mutation that touches
 * an assessment (or its categories/questions/bands/pages) must confirm the assessment
 * is within the caller's scope:
 *   - a tenant admin → only their own tenant's assessments;
 *   - a super admin (global) → any assessment.
 * A missed check here is a cross-tenant IDOR, so these are the single choke point.
 */
export async function assessmentInScope(assessmentId: string): Promise<boolean> {
  const scope = await resolveActingScope();
  const found = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...tenantScope(scope) },
    select: { id: true },
  });
  return !!found;
}

/** Resolve the owning assessmentId from a category id, or null if out of scope. */
export async function scopedAssessmentIdForCategory(categoryId: string): Promise<string | null> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { assessmentId: true },
  });
  if (!cat) return null;
  return (await assessmentInScope(cat.assessmentId)) ? cat.assessmentId : null;
}

/** Resolve the owning assessmentId from a question id, or null if out of scope. */
export async function scopedAssessmentIdForQuestion(questionId: string): Promise<string | null> {
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { category: { select: { assessmentId: true } } },
  });
  const assessmentId = q?.category?.assessmentId ?? null;
  if (!assessmentId) return null;
  return (await assessmentInScope(assessmentId)) ? assessmentId : null;
}
