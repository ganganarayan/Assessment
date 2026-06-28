import "server-only";
import { CrmSendKind, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const contactName = (f: string | null, l: string | null) =>
  [f, l].map((p) => p?.trim() ?? "").filter(Boolean).join(" ") || null;

/**
 * (Re-)enqueue a set of submissions as jobs of `kind`. Idempotent: existing jobs
 * for these submissions are cleared first (except any mid-send SENDING row), then
 * fresh PENDING rows are created. So clicking Start again re-queues cleanly and a
 * recomputed contact can be sent anew.
 */
async function enqueue(
  kind: CrmSendKind,
  subs: { id: string; leadFirstName: string | null; leadLastName: string | null; leadEmail: string | null; leadMobile: string | null }[],
): Promise<number> {
  if (subs.length === 0) return 0;
  const ids = subs.map((s) => s.id);
  await prisma.crmSendQueue.deleteMany({
    where: { kind, submissionId: { in: ids }, status: { not: "SENDING" } },
  });
  const created = await prisma.crmSendQueue.createMany({
    data: subs.map((s) => ({
      kind,
      submissionId: s.id,
      contactName: contactName(s.leadFirstName, s.leadLastName),
      contactEmail: s.leadEmail,
      contactPhone: s.leadMobile,
    })),
    skipDuplicates: true, // a still-SENDING row blocks its own re-create; fine
  });
  return created.count;
}

/** Enqueue all COMPLETED + changed (crmDirty) contacts for a SCORE resend. */
export async function enqueueScore(): Promise<number> {
  const subs = await prisma.submission.findMany({
    where: { status: "COMPLETED", crmDirty: true },
    select: { id: true, leadFirstName: true, leadLastName: true, leadEmail: true, leadMobile: true },
  });
  return enqueue(CrmSendKind.SCORE, subs);
}

export type CustomScope = "all" | "paid";

/**
 * The Submission WHERE for a CUSTOM broadcast — the SINGLE source of truth shared
 * by the count preview and the actual enqueue, so the previewed number always
 * matches what gets queued.
 * - scope="paid": COMPLETED contacts of this assessment that ALSO have a captured
 *   payment (paid read from the payment table, independent of the completedPaidAt
 *   stamp). `empty` short-circuits when there are no paid submissions at all.
 * - scope="all": every COMPLETED contact of this assessment.
 */
async function customTargetWhere(
  assessmentId: string,
  scope: CustomScope,
): Promise<{ where: Prisma.SubmissionWhereInput; empty: boolean }> {
  const base: Prisma.SubmissionWhereInput = {
    assessmentId,
    status: "COMPLETED",
    OR: [{ leadEmail: { not: null } }, { leadMobile: { not: null } }],
  };
  if (scope === "paid") {
    const payments = await prisma.payment.findMany({
      where: { purpose: "assessment_unlock", status: { in: ["captured", "paid"] }, submissionId: { not: null } },
      select: { submissionId: true },
    });
    const paidIds = [...new Set(payments.map((p) => p.submissionId).filter((x): x is string => Boolean(x)))];
    if (paidIds.length === 0) return { where: base, empty: true };
    return { where: { ...base, id: { in: paidIds } }, empty: false };
  }
  return { where: base, empty: false };
}

/** Enqueue contacts for a CUSTOM broadcast (see customTargetWhere for the scope). */
export async function enqueueCustom(assessmentId: string, scope: CustomScope = "all"): Promise<number> {
  const { where, empty } = await customTargetWhere(assessmentId, scope);
  if (empty) return 0;
  const subs = await prisma.submission.findMany({
    where,
    select: { id: true, leadFirstName: true, leadLastName: true, leadEmail: true, leadMobile: true },
  });
  return enqueue(CrmSendKind.CUSTOM, subs);
}

/** How many contacts the same scope WOULD queue — for the pre-send count preview. */
export async function countCustomTargets(assessmentId: string, scope: CustomScope = "all"): Promise<number> {
  const { where, empty } = await customTargetWhere(assessmentId, scope);
  if (empty) return 0;
  return prisma.submission.count({ where });
}
