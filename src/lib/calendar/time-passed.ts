import "server-only";
import { prisma } from "@/lib/db/prisma";
import { timePassedWindow } from "@/lib/calendar/slots";
import { fireWorkflowTrigger } from "@/lib/workflows/enqueue";
import { upsertContactFromLead } from "@/lib/contacts/upsert";

/**
 * The call whose hour came and went while nobody said what happened.
 *
 * Every other appointment trigger has somebody behind it - an operator pressing a
 * button, a respondent clicking a link. This one has nobody, which is exactly why it
 * exists: a booking still marked BOOKED two hours after it ended is the owner having
 * forgotten, and the cost of that forgetting is that the attendance conversion never
 * fires and the ad account never learns whether the call was worth buying.
 *
 * So it is found rather than emitted: one indexed sweep on the same heartbeat that
 * drains the reminders.
 *
 * WHY IT IS SAFE WITH SEVERAL REPLICAS, and why the stamp is not just a flag. The
 * claim is a conditional UPDATE matched on "the stamp is still null", so of ten
 * instances sweeping at once exactly one wins each row and the rest get a count of
 * zero. The same guard reportAppointment uses for its moments.
 */

/** Rows per pass. The sweep is a trickle by nature - a workspace with more than a
 *  handful of unmarked calls in a pass has a bigger problem than throughput. */
const BATCH = 50;

export async function sweepTimePassedAppointments(nowMs = Date.now()): Promise<number> {
  const { from, to } = timePassedWindow(nowMs);
  const candidates = await prisma.appointment.findMany({
    where: {
      status: "BOOKED",
      endAt: { gt: from, lte: to },
      firedTimePassedAt: null,
      // Time the owner blocked out for themselves has no attendee and no outcome to
      // mark, so it is not an unmarked call.
      source: "BOOKING",
      tenant: { deletedAt: null },
    },
    orderBy: { endAt: "asc" },
    take: BATCH,
    select: {
      id: true,
      tenantId: true,
      submissionId: true,
      attendeeName: true,
      attendeeEmail: true,
      attendeeMobile: true,
      bookingType: { select: { assessmentId: true } },
      submission: {
        select: {
          leadFirstName: true,
          leadLastName: true,
          leadEmail: true,
          leadMobile: true,
          leadProfession: true,
        },
      },
    },
  });

  let fired = 0;
  for (const a of candidates) {
    try {
      // Claim it first. If the workflow side then fails, the row stays claimed and is
      // not retried - deliberately. A sequence that failed to start is a missed
      // message; one that retries forever on a timer is every message, repeatedly.
      const claim = await prisma.appointment.updateMany({
        where: { id: a.id, firedTimePassedAt: null },
        data: { firedTimePassedAt: new Date(nowMs) },
      });
      if (claim.count === 0) continue;

      const parts = (a.attendeeName ?? "").trim().split(/\s+/).filter(Boolean);
      const contactId = await upsertContactFromLead(
        {
          tenantId: a.tenantId,
          firstName: a.submission?.leadFirstName ?? parts[0] ?? null,
          lastName: a.submission?.leadLastName ?? (parts.slice(1).join(" ") || null),
          email: a.submission?.leadEmail ?? a.attendeeEmail,
          mobile: a.submission?.leadMobile ?? a.attendeeMobile,
          profession: a.submission?.leadProfession ?? null,
        },
        { source: "APPOINTMENT" },
      );
      if (!contactId) continue;

      await fireWorkflowTrigger("APPOINTMENT_TIME_PASSED", {
        tenantId: a.tenantId,
        contactId,
        assessmentId: a.bookingType?.assessmentId ?? null,
        subjectId: a.submissionId,
      });
      fired++;
    } catch (e) {
      console.error(
        `[calendar] time-passed sweep failed for ${a.id}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  return fired;
}
