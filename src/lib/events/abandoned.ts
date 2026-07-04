import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { emitEvent } from "@/lib/events/emit";
import { normalizeAttribution } from "@/lib/events/payload";
import { type EmitInput } from "@/features/events/types";

const DEFAULT_HOURS = 24;
const BATCH = 500;

/**
 * Find submissions that were STARTED (lead.created) but never COMPLETED after
 * the configured delay, mark them abandoned (once), and emit assessment.abandoned.
 *
 * Idempotent + concurrency-safe: the STARTED->abandoned flip is a compare-and-
 * swap (updateMany guarded on status+abandonedAt), so an event fires at most
 * once per submission even if the sweep overlaps with itself or a completion.
 */
export async function sweepAbandoned(): Promise<{ swept: number; scanned: number }> {
  const setting = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  const hours = setting?.abandonedAfterHours ?? DEFAULT_HOURS;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const candidates = await prisma.submission.findMany({
    // completedAt: null excludes ever-completed submissions — a paid-mode respondent
    // who completed then returned to edit is reset to STARTED (keeping the old
    // startedAt), and must NOT be swept as abandoned / nurtured as a lost lead.
    where: { status: "STARTED", abandonedAt: null, completedAt: null, startedAt: { lt: cutoff } },
    select: {
      id: true,
      assessmentId: true,
      startedAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      attribution: true,
      assessment: {
        select: {
          id: true,
          slug: true,
          title: true,
          tenant: { select: { id: true, slug: true, name: true } },
        },
      },
    },
    take: BATCH,
  });

  let swept = 0;
  for (const s of candidates) {
    const claim = await prisma.submission.updateMany({
      where: { id: s.id, status: "STARTED", abandonedAt: null },
      data: { abandonedAt: new Date() },
    });
    if (claim.count === 0) continue; // someone else handled/completed it

    await emitEvent(EventType.ASSESSMENT_ABANDONED, {
      submissionId: s.id,
      tenant: s.assessment.tenant,
      assessment: { id: s.assessment.id, slug: s.assessment.slug, title: s.assessment.title },
      lead: {
        firstName: s.leadFirstName,
        lastName: s.leadLastName,
        email: s.leadEmail,
        mobile: s.leadMobile,
      },
      attribution: normalizeAttribution(s.attribution) ?? undefined,
    } satisfies EmitInput);
    swept++;
  }

  return { swept, scanned: candidates.length };
}
