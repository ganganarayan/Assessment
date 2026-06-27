import "server-only";
import { prisma } from "@/lib/db/prisma";

/** Captured-payment summary for a submission (amount in rupees, paid-at ISO). */
export interface PaidInfo {
  amount: number | null;
  at: string;
}

/**
 * Batch-load the captured assessment-unlock payment per submission (latest wins),
 * so the Contacts/Submissions tables can show a Paid column without an N+1.
 */
export async function getPaidBySubmission(submissionIds: string[]): Promise<Map<string, PaidInfo>> {
  const map = new Map<string, PaidInfo>();
  if (submissionIds.length === 0) return map;
  const rows = await prisma.payment.findMany({
    where: { submissionId: { in: submissionIds }, purpose: "assessment_unlock", status: "captured" },
    orderBy: { createdAt: "desc" },
    select: { submissionId: true, amount: true, createdAt: true },
  });
  for (const r of rows) {
    if (!r.submissionId || map.has(r.submissionId)) continue; // ordered desc => first = latest
    map.set(r.submissionId, { amount: r.amount != null ? r.amount / 100 : null, at: r.createdAt.toISOString() });
  }
  return map;
}
