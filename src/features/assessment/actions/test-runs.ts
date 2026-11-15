"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope, scopeEditDenied } from "@/lib/tenant/acting";
import { publicOriginFor } from "@/lib/tenant/public-origin";
import { testLinkUrl } from "@/lib/funnel/test-link";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Owner test runs for one assessment: the signed test link to walk it with, and a way to
 * clear what those walks left behind. Test rows are flagged isPreview and already kept out
 * of every real number; clearing them simply tidies the Submissions list and the test
 * counts before a fresh round of testing.
 */

/** The signed test link for one assessment (valid 7 days). Opens drafts too, loads no browser pixel, skips the retake lock, and never sends a production event to Meta. Hand this to the owner for every test run; never the live link. */
export async function getTestLink(assessmentId: string): Promise<ActionResult<{ url: string; expires: Date; live_url: string }>> {
  const scope = await resolveActingScope();
  const a = await prisma.assessment.findFirst({ where: { id: assessmentId, ...tenantScope(scope) }, select: { id: true, slug: true, tenantId: true } });
  if (!a) return { ok: false, error: "Not found." };
  const origin = await publicOriginFor(a.tenantId);
  const link = testLinkUrl(origin, a.slug, a.id);
  return { ok: true, data: { url: link.url, expires: link.expiresAt, live_url: `${origin.replace(/\/+$/, "")}/a/${a.slug}` } };
}

/** Delete every owner test run of one assessment: test visits, test gate passes and rejections, and test submissions with their answers. Real traffic is never touched. */
export async function clearTestRuns(
  assessmentId: string,
): Promise<ActionResult<{ visits: number; gate_passed: number; turned_away: number; submissions: number }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const a = await prisma.assessment.findFirst({ where: { id: assessmentId, ...tenantScope(scope) }, select: { id: true } });
  if (!a) return { ok: false, error: "Not found." };

  const where = { assessmentId: a.id, isPreview: true };
  const [visits, gatePassed, turnedAway, submissions] = await prisma.$transaction([
    prisma.pageView.deleteMany({ where }),
    prisma.gateEntry.deleteMany({ where }),
    prisma.gateDisqualification.deleteMany({ where }),
    prisma.submission.deleteMany({ where }),
  ]);
  revalidatePath("/w/submissions");
  revalidatePath("/admin/submissions");
  return { ok: true, data: { visits: visits.count, gate_passed: gatePassed.count, turned_away: turnedAway.count, submissions: submissions.count } };
}
