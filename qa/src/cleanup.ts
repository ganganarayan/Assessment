/**
 * Taking the sweep's own rows back out again.
 *
 * Off by default, because the rows ARE the evidence: a failure is argued about by
 * looking at what the funnel wrote, and a harness that deletes that first is a harness
 * that cannot be checked. When it does run it is narrow on purpose - this run's
 * identities on this funnel, nothing else - and it says what it removed.
 *
 * Submissions cascade to their answers, category scores, AI statements and CRM jobs
 * through the schema, so deleting the submission is enough.
 */
import { db } from "./db.js";
import { runPrefix } from "./drive/identity.js";
import type { SweepResult } from "./sweep.js";
import type { Funnel } from "./config/read.js";

export interface CleanupReport {
  submissions: number;
  gateEntries: number;
  disqualifications: number;
}

export async function cleanupRun(funnel: Funnel, result: SweepResult): Promise<CleanupReport> {
  const assessmentId = funnel.row.id;
  const prefix = runPrefix(result.runId);

  // Identities this run created, by the address pattern it owns. Narrow by assessment
  // too: the same prefix on another funnel belongs to another sweep.
  const submissions = await db().submission.deleteMany({
    where: { assessmentId, leadEmail: { startsWith: prefix } },
  });

  // The visitor rows are keyed on ids rather than emails, so they are removed by the
  // ids this run actually used.
  const externalIds = result.results
    .map((r) => r.observation?.externalId)
    .filter((v): v is string => Boolean(v));
  const visitorIds = result.results
    .map((r) => r.observation?.visitorId)
    .filter((v): v is string => Boolean(v));

  const gateEntries = externalIds.length
    ? await db().gateEntry.deleteMany({ where: { assessmentId, visitorId: { in: externalIds } } })
    : { count: 0 };
  const disqualifications = visitorIds.length
    ? await db().gateDisqualification.deleteMany({ where: { assessmentId, visitorId: { in: visitorIds } } })
    : { count: 0 };

  return {
    submissions: submissions.count,
    gateEntries: gateEntries.count,
    disqualifications: disqualifications.count,
  };
}
