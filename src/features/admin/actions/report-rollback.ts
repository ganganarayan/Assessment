"use server";

import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, tenantScope } from "@/lib/tenant/acting";
import { rollbackStoredReport } from "@/lib/reports/store";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Put a submission's PREVIOUS PDF report back as the current one.
 *
 * Exists because regenerating a report is not always an improvement: an AI statement
 * rerun can come back worse, and a band recompute can be reverted. Two versions are
 * retained (see lib/reports/store), and this is how the operator chooses between them.
 *
 * Scoped like every other submission action: a tenant can only act on its own rows, and
 * view-only staff are refused. Without the scope filter this would be an id-guessing
 * hole into another workspace's reports.
 */
export async function rollbackReport(submissionId: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const owned = await prisma.submission.findFirst({
    where: { id: submissionId, ...tenantScope(scope) },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Not found." };

  const rolled = await rollbackStoredReport(submissionId);
  // Distinguish "nothing to roll back to" from success, rather than reporting a change
  // that did not happen — an operator who clicks and sees "done" will assume the older
  // report is now live.
  return rolled
    ? { ok: true }
    : { ok: false, error: "No previous report to restore — this one has not been regenerated yet." };
}

/** Whether a submission HAS a previous report, so the UI only offers rollback when it
 *  would do something. Cheap enough to include in the row query. */
export async function hasPreviousReport(submissionId: string): Promise<boolean> {
  const row = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { reportPrevKey: true },
  });
  return !!row?.reportPrevKey;
}
