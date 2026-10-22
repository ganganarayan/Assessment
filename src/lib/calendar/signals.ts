import "server-only";
import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { emitEvent } from "@/lib/events/emit";
import { sendCapiEventVerbose } from "@/lib/meta/send";
import { bumpFunnelEventCount } from "@/lib/meta/funnel-count";
import { tenantCan } from "@/lib/billing/plan-resolve";
import { formatIST } from "@/lib/date";
import { normalizeAttribution } from "@/lib/events/payload";
import { deleteZoomMeeting } from "@/lib/zoom/meetings";
import { fireWorkflowTrigger } from "@/lib/workflows/enqueue";
import { upsertContactFromLead } from "@/lib/contacts/upsert";
import type { WorkflowTrigger } from "@prisma/client";
import type { PayloadAppointment } from "@/features/events/types";

/**
 * What the rest of the app tells the outside world about an appointment.
 *
 * ONE function, five moments. Each moment emits its event (so the CRM webhooks fire)
 * and sends its Meta conversion, together, exactly once. Fully fail-soft: a booking
 * must never fail because a pixel is misconfigured or a CRM is down, so everything
 * here is wrapped and nothing is rethrown.
 *
 * 🔴 Why ATTENDED and NO_SHOW are the point of the whole feature. A booking is an
 * intention: the ad account learns only that somebody filled a form. The outcome is
 * marked by the owner hours or days later, from the calendar, and that is the signal
 * worth optimizing against - it is the difference between buying conversations and
 * buying empty slots. Which is also why the match signals are snapshotted on the
 * appointment at booking time: by the time Friday's attendance is marked, the browser
 * that clicked Monday's ad is long gone and there is no request to read _fbp from.
 */

export type AppointmentMoment = "BOOKED" | "RESCHEDULED" | "CANCELLED" | "ATTENDED" | "NO_SHOW";

const EVENT_TYPE_FOR: Record<AppointmentMoment, EventType> = {
  BOOKED: EventType.APPOINTMENT_BOOKED,
  RESCHEDULED: EventType.APPOINTMENT_RESCHEDULED,
  CANCELLED: EventType.APPOINTMENT_CANCELLED,
  ATTENDED: EventType.APPOINTMENT_ATTENDED,
  NO_SHOW: EventType.APPOINTMENT_NO_SHOW,
};

/**
 * Claim the moment, atomically, so it is reported once.
 *
 * updateMany with the "stamp is still null" filter means only the FIRST caller gets a
 * count of 1; a double click, a retry or a second operator gets 0 and the whole report
 * is skipped. The same guard nurture uses for its once-per-submission send.
 *
 * RESCHEDULED returns true every time on purpose: a call moved twice is two things the
 * CRM needs to hear.
 */
async function claimMoment(appointmentId: string, moment: AppointmentMoment): Promise<boolean> {
  const now = new Date();
  if (moment === "RESCHEDULED") return true;
  const claim =
    moment === "BOOKED"
      ? await prisma.appointment.updateMany({
          where: { id: appointmentId, reportedBookedAt: null },
          data: { reportedBookedAt: now },
        })
      : moment === "CANCELLED"
        ? await prisma.appointment.updateMany({
            where: { id: appointmentId, reportedCancelledAt: null },
            data: { reportedCancelledAt: now },
          })
        : moment === "ATTENDED"
          ? await prisma.appointment.updateMany({
              where: { id: appointmentId, reportedAttendedAt: null },
              data: { reportedAttendedAt: now },
            })
          : await prisma.appointment.updateMany({
              where: { id: appointmentId, reportedNoShowAt: null },
              data: { reportedNoShowAt: now },
            });
  return claim.count > 0;
}

/** The Meta event name this booking type uses for the moment, or null when its owner
 *  has switched the Meta side off (the CRM event still fires). */
function metaEventName(
  moment: AppointmentMoment,
  bookingType: {
    fireMetaCapi: boolean;
    metaBookedEvent: string;
    metaCancelledEvent: string;
    metaAttendedEvent: string;
    metaNoShowEvent: string;
  } | null,
): string | null {
  if (!bookingType || !bookingType.fireMetaCapi) return null;
  switch (moment) {
    case "BOOKED":
      return bookingType.metaBookedEvent;
    case "CANCELLED":
      return bookingType.metaCancelledEvent;
    case "ATTENDED":
      return bookingType.metaAttendedEvent;
    case "NO_SHOW":
      return bookingType.metaNoShowEvent;
    // A reschedule is not a conversion. It is a date change, and reporting one would
    // teach the ad account that moving a call is a second booking.
    case "RESCHEDULED":
      return null;
  }
}

const WORKFLOW_TRIGGER_FOR: Record<AppointmentMoment, WorkflowTrigger> = {
  BOOKED: "APPOINTMENT_BOOKED",
  RESCHEDULED: "APPOINTMENT_RESCHEDULED",
  CANCELLED: "APPOINTMENT_CANCELLED",
  ATTENDED: "APPOINTMENT_ATTENDED",
  NO_SHOW: "APPOINTMENT_NO_SHOW",
};

/**
 * Start any workflow sequence waiting on this moment.
 *
 * Separate from the CRM event and the Meta conversion because it needs something they
 * do not: a CONTACT. The event bus is happy with whatever the attendee typed, but a
 * workflow sends messages over days and has to know who it is sending to, so the
 * attendee is resolved to a contact row first. A walk-up booking with neither an email
 * nor a mobile resolves to nobody and simply starts nothing.
 *
 * Fail-soft like everything else here, and deliberately AFTER the event and the
 * conversion. A sequence is the least urgent of the three.
 */
async function startWorkflows(
  trigger: WorkflowTrigger,
  a: {
    tenantId: string;
    submissionId: string | null;
    attendeeEmail: string | null;
    attendeeMobile: string | null;
    assessmentId: string | null;
    lead: { firstName: string | null; lastName: string | null; email: string | null; mobile: string | null; profession: string | null };
  },
): Promise<void> {
  try {
    const contactId = await upsertContactFromLead(
      {
        tenantId: a.tenantId,
        firstName: a.lead.firstName,
        lastName: a.lead.lastName,
        email: a.lead.email ?? a.attendeeEmail,
        mobile: a.lead.mobile ?? a.attendeeMobile,
        profession: a.lead.profession,
      },
      { source: "APPOINTMENT" },
    );
    if (!contactId) return;
    await fireWorkflowTrigger(trigger, {
      tenantId: a.tenantId,
      contactId,
      assessmentId: a.assessmentId,
      subjectId: a.submissionId,
    });
  } catch (e) {
    console.error("[calendar] workflow trigger failed:", e instanceof Error ? e.message : String(e));
  }
}

const splitName = (full: string | null): { firstName: string | null; lastName: string | null } => {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null };
};

export async function reportAppointment(appointmentId: string, moment: AppointmentMoment): Promise<void> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        tenantId: true,
        source: true,
        status: true,
        startAt: true,
        endAt: true,
        attendeeName: true,
        attendeeEmail: true,
        attendeeMobile: true,
        notes: true,
        submissionId: true,
        cancelledBy: true,
        isPreview: true,
        fbp: true,
        fbc: true,
        externalId: true,
        clientIp: true,
        userAgent: true,
        attribution: true,
        tenant: { select: { id: true, slug: true, name: true } },
        bookingType: {
          select: {
            id: true,
            name: true,
            slug: true,
            locationKind: true,
            locationValue: true,
            adAccountId: true,
            fireMetaCapi: true,
            metaBookedEvent: true,
            metaCancelledEvent: true,
            metaAttendedEvent: true,
            metaNoShowEvent: true,
            assessment: { select: { id: true, slug: true, title: true } },
          },
        },
        submission: {
          select: {
            id: true,
            customerId: true,
            resultToken: true,
            leadFirstName: true,
            leadLastName: true,
            leadEmail: true,
            leadMobile: true,
            leadProfession: true,
          },
        },
      },
    });
    if (!appointment) return;

    // Time the owner blocked out for themselves is not an appointment anybody booked.
    // It occupies the slot and tells nobody anything - no event, no conversion.
    if (appointment.source === "MANUAL" && !appointment.bookingType) return;

    if (!(await claimMoment(appointmentId, moment))) return;

    /**
     * A cancelled call releases its Zoom meeting.
     *
     * Here rather than at each cancel site, because there are two of them - the owner
     * cancelling from the calendar and the respondent cancelling from their own link -
     * and a workspace's Zoom filling with meetings for calls that are not happening is
     * exactly the kind of mess nobody notices until it is large. Best-effort and never
     * blocking: the cancellation itself has already happened.
     */
    if (moment === "CANCELLED") {
      void deleteZoomMeeting(appointmentId).catch(() => {});
    }

    const durationMin = Math.max(
      1,
      Math.round((appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000),
    );
    const payload: PayloadAppointment = {
      id: appointment.id,
      bookingType: appointment.bookingType?.name ?? null,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      startLabel: formatIST(appointment.startAt),
      durationMin,
      status: appointment.status,
      locationKind: appointment.bookingType?.locationKind ?? null,
      locationValue: appointment.bookingType?.locationValue ?? null,
      cancelledBy: appointment.cancelledBy ?? null,
    };

    // The lead on the submission is the better record when there is one (it carries the
    // first/last split and the profession the CRM maps); the attendee fields are what a
    // walk-up booking typed. Prefer the submission, fall back to the attendee.
    const attendee = splitName(appointment.attendeeName);
    const lead = {
      firstName: appointment.submission?.leadFirstName ?? attendee.firstName,
      lastName: appointment.submission?.leadLastName ?? attendee.lastName,
      email: appointment.submission?.leadEmail ?? appointment.attendeeEmail,
      mobile: appointment.submission?.leadMobile ?? appointment.attendeeMobile,
      profession: appointment.submission?.leadProfession ?? null,
    };

    const assessment = appointment.bookingType?.assessment ?? null;

    await emitEvent(EVENT_TYPE_FOR[moment], {
      submissionId: appointment.submissionId,
      customerId: appointment.submission?.customerId ?? null,
      resultToken: appointment.submission?.resultToken ?? null,
      tenant: appointment.tenant,
      assessment: assessment ? { id: assessment.id, slug: assessment.slug, title: assessment.title } : null,
      lead,
      attribution: normalizeAttribution(appointment.attribution),
      appointment: payload,
    });

    await startWorkflows(WORKFLOW_TRIGGER_FOR[moment], {
      tenantId: appointment.tenantId,
      submissionId: appointment.submissionId,
      attendeeEmail: appointment.attendeeEmail,
      attendeeMobile: appointment.attendeeMobile,
      // The funnel the BOOKING LINK belongs to, which is what scoping a workflow to an
      // assessment means for an appointment trigger.
      assessmentId: assessment?.id ?? null,
      lead,
    });

    const eventName = metaEventName(moment, appointment.bookingType);
    if (!eventName) return;
    if (!(await tenantCan(appointment.tenantId, "capi"))) return;

    const res = await sendCapiEventVerbose(
      {
        eventName,
        // Deterministic, so a retry of the same moment is one event at Meta rather than
        // two. The moment is in the key because one appointment legitimately produces a
        // Schedule and, later, an attendance.
        eventId: `${appointment.id}:${eventName}`,
        eventTimeMs: Date.now(),
        preview: appointment.isPreview,
        eventSourceUrl: appointment.bookingType
          ? `${env.NEXT_PUBLIC_APP_URL}/b/${appointment.bookingType.slug}`
          : env.NEXT_PUBLIC_APP_URL,
        user: {
          email: lead.email,
          phone: lead.mobile,
          firstName: lead.firstName,
          lastName: lead.lastName,
          clientIpAddress: appointment.clientIp,
          clientUserAgent: appointment.userAgent,
          fbp: appointment.fbp,
          fbc: appointment.fbc,
          externalId: appointment.externalId,
        },
        customData: {
          booking_type: appointment.bookingType?.name ?? "",
          duration_min: durationMin,
          ...(assessment ? { assessment: assessment.slug, assessment_name: assessment.title } : {}),
        },
      },
      appointment.tenantId,
      appointment.bookingType?.adAccountId ?? null,
    );

    // Counted per funnel, like every other funnel event, so the Stats page can show
    // bookings and attendance beside completions instead of in a separate story.
    if (assessment) {
      await bumpFunnelEventCount({
        assessmentId: assessment.id,
        tenantId: appointment.tenantId,
        eventName,
        ok: res.ok,
      });
    }
  } catch (e) {
    console.error(
      `[calendar] reporting ${moment} for ${appointmentId} failed:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}
