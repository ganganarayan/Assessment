"use server";

import { prisma } from "@/lib/db/prisma";
import { actingDataScope } from "@/lib/tenant/acting";
import { whereScope } from "@/lib/tenant/scope";
import { type LookupResult } from "@/features/admin/lookup-types";

/**
 * Find a lead across EVERY assessment and date in the caller's scope, by result token,
 * customer id, email, mobile or name.
 *
 * This is the SERVER-SIDE search behind the Submissions table. The table itself holds a
 * bounded window of recent rows and filters that instantly; when the person being
 * looked for is not in the window, this searches the whole table instead. That is what
 * lets the page stop loading every submission into memory just so a text box can match.
 *
 * 🔴 Scope fix: this used to filter by `actingTenantId()`, which is NULL for a super
 * admin who has not entered a workspace — so it searched only rows owned by nobody.
 * That is fine while the owner's funnel lives in the null scope and returns NOTHING the
 * moment it moves to a real tenant. It now follows the data scope, so no workspace
 * entered means every tenant (and a tenant admin still sees only their own).
 *
 * Read-only, and returns the most recent single match: this answers "where is this
 * person", not "list everyone called Sharma".
 */
export async function lookupSubmissionRef(raw: string): Promise<LookupResult> {
  const value = raw.trim();
  if (!value) return { ok: true, hit: null };
  const candidates = Array.from(new Set([value, value.toUpperCase()]));
  const scope = await actingDataScope();
  // Ids are matched EXACTLY (they are unique and case-normalised); contact details and
  // names are matched loosely, because an operator pasting an email has the whole thing
  // but someone reading a name off a call has a fragment.
  const s = await prisma.submission.findFirst({
    where: {
      ...whereScope(scope),
      OR: [
        { resultToken: { in: candidates } },
        { customerId: { in: candidates } },
        { leadEmail: { contains: value, mode: "insensitive" } },
        { leadMobile: { contains: value } },
        { leadFirstName: { contains: value, mode: "insensitive" } },
        { leadLastName: { contains: value, mode: "insensitive" } },
      ],
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
