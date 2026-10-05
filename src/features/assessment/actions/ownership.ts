import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, tenantScope } from "@/lib/tenant/acting";

/**
 * Tenant-isolation gate for assessment-editing actions. Every mutation that touches
 * an assessment (or its categories/questions/bands/pages) must confirm the assessment
 * is within the caller's scope:
 *   - a tenant admin → only their own tenant's assessments;
 *   - a super admin (global) → any assessment.
 * A missed check here is a cross-tenant IDOR, so these are the single choke point.
 */
/**
 * Authorize an Operations tool that acts on ONE assessment, for a caller who may be a
 * super admin OR a tenant admin. Returns the error result to return, or null to proceed.
 *
 * WHY THIS EXISTS
 * These tools were written for /admin and guarded with `requireSuperAdmin()`, which does
 * not return an error - it REDIRECTS a non-super caller to /w, and /w redirects on to
 * /w/assessments. Mounting the same panel at /w/operations therefore bounced every tenant
 * admin straight back to Assessments the moment the page mounted, because the panel
 * auto-loads a count on render. The page looked broken and nothing said why.
 *
 * Scope, not role, is the right gate here: a tenant admin may run these against their own
 * assessments, and the assessment check is what keeps that from reaching another tenant's.
 */
export async function assessmentOpDenied(
  assessmentId: string,
  opts: { mutation: boolean },
): Promise<{ ok: false; error: string } | null> {
  const scope = await resolveActingScope();
  if (opts.mutation) {
    const denied = scopeEditDenied(scope);
    if (denied) return denied;
  }
  const found = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...tenantScope(scope) },
    select: { id: true },
  });
  if (!found) return { ok: false, error: "That assessment isn't in this workspace." };
  return null;
}

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
