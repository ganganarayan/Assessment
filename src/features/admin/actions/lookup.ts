"use server";

import { prisma } from "@/lib/db/prisma";
import { actingTenantId } from "@/lib/tenant/acting";
import { type LookupResult } from "@/features/admin/lookup-types";

/**
 * Trace a lead by a pasted result token (16-char) OR customer id (8-char), across
 * EVERY assessment and date in the caller's scope. The Submissions table is scoped
 * to one assessment + a date window, which hides a lead when all you hold is the id
 * a tool (VidaPulse) captured and you don't know which assessment it belongs to.
 *
 * Read-only. Tenant-scoped exactly like listSubmissions (via actingTenantId — a
 * super admin not impersonating sees the platform/null-tenant funnel; a tenant admin
 * sees only their own), so no lead from another workspace can leak. Both ids are
 * @unique, so at most one row matches. The public-id alphabet is uppercase, so a
 * lowercased paste is accepted too.
 */
export async function lookupSubmissionRef(raw: string): Promise<LookupResult> {
  const value = raw.trim();
  if (!value) return { ok: true, hit: null };
  const candidates = Array.from(new Set([value, value.toUpperCase()]));
  const t = await actingTenantId();
  const s = await prisma.submission.findFirst({
    where: {
      tenantId: t,
      OR: [{ resultToken: { in: candidates } }, { customerId: { in: candidates } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      customerId: true,
      resultToken: true,
      assessmentId: true,
      assessment: { select: { slug: true, title: true } },
    },
  });
  if (!s) return { ok: true, hit: null };
  return {
    ok: true,
    hit: {
      submissionId: s.id,
      assessmentId: s.assessmentId,
      slug: s.assessment.slug,
      assessmentTitle: s.assessment.title,
      firstName: s.leadFirstName,
      lastName: s.leadLastName,
      email: s.leadEmail,
      mobile: s.leadMobile,
      profession: s.leadProfession,
      customerId: s.customerId,
      resultToken: s.resultToken,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    },
  };
}
