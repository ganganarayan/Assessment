import "server-only";
import { CrmSendKind } from "@prisma/client";
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

/** Enqueue all COMPLETED contacts of an assessment for a CUSTOM broadcast. */
export async function enqueueCustom(assessmentId: string): Promise<number> {
  const subs = await prisma.submission.findMany({
    where: {
      assessmentId,
      status: "COMPLETED",
      OR: [{ leadEmail: { not: null } }, { leadMobile: { not: null } }],
    },
    select: { id: true, leadFirstName: true, leadLastName: true, leadEmail: true, leadMobile: true },
  });
  return enqueue(CrmSendKind.CUSTOM, subs);
}
