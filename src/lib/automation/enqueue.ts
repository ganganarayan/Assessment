import "server-only";
import { EventType, type AutomationTrigger } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isStillAhead, reminderDueAt } from "@/lib/automation/schedule";

/**
 * The hook between the event bus and the automations: what an event makes due.
 *
 * Called from emitEvent, once, after the event is logged and its webhooks are queued.
 * Everything it does is a row, never a timer: a reminder is due hours or days after the
 * thing that scheduled it, and an in-process timer dies with the deploy that created it,
 * silently and with nobody to tell. The cron picks up whatever is due.
 *
 * Fail-soft throughout. A booking must never fail because an automation could not be
 * queued, so this never throws.
 */

const TRIGGER_FOR: Partial<Record<EventType, AutomationTrigger>> = {
  [EventType.APPOINTMENT_BOOKED]: "APPOINTMENT_BOOKED",
  [EventType.APPOINTMENT_RESCHEDULED]: "APPOINTMENT_RESCHEDULED",
  [EventType.APPOINTMENT_CANCELLED]: "APPOINTMENT_CANCELLED",
  [EventType.APPOINTMENT_ATTENDED]: "APPOINTMENT_ATTENDED",
  [EventType.APPOINTMENT_NO_SHOW]: "APPOINTMENT_NO_SHOW",
};


/**
 * Queue one automation against one appointment, or re-date the row that is already
 * there.
 *
 * The table is UNIQUE on (automation, appointment), so this is an upsert and that is the
 * whole dedup story: a re-emitted event moves the due time instead of queueing a second
 * reminder, and a call moved twice ends up with one row pointing at the latest time.
 */
async function queue(args: {
  automationId: string;
  appointmentId: string;
  tenantId: string;
  dueAt: Date;
}): Promise<string | null> {
  try {
    const run = await prisma.automationRun.upsert({
      where: {
        automationId_appointmentId: {
          automationId: args.automationId,
          appointmentId: args.appointmentId,
        },
      },
      // Back to PENDING on purpose: a rescheduled call has to send its reminder again,
      // at the new time, even if the first one already went out at the old one.
      update: { dueAt: args.dueAt, status: "PENDING", attempts: 0, lastError: null, skipReason: null },
      create: {
        automationId: args.automationId,
        appointmentId: args.appointmentId,
        tenantId: args.tenantId,
        dueAt: args.dueAt,
      },
      select: { id: true, dueAt: true },
    });
    return run.id;
  } catch {
    return null;
  }
}

/** Stop pending runs that no longer make sense, with a reason the owner can read. */
async function callOffPending(appointmentId: string, reason: string, triggers?: AutomationTrigger[]) {
  await prisma.automationRun
    .updateMany({
      where: {
        appointmentId,
        status: "PENDING",
        ...(triggers ? { automation: { trigger: { in: triggers } } } : {}),
      },
      data: { status: "CANCELLED", skipReason: reason },
    })
    .catch(() => {});
}

/**
 * What this event makes due. Returns the ids of runs that are due NOW, so the caller can
 * send them immediately instead of leaving a booking confirmation waiting for the cron.
 */
export async function enqueueAutomationsForEvent(
  type: EventType,
  appointmentId: string | null | undefined,
): Promise<string[]> {
  const trigger = TRIGGER_FOR[type];
  if (!trigger || !appointmentId) return [];

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, tenantId: true, bookingTypeId: true, startAt: true, source: true },
    });
    if (!appointment) return [];
    // Time the owner blocked out for themselves has nobody to message.
    if (appointment.source === "MANUAL" && !appointment.bookingTypeId) return [];

    const now = new Date();
    const dueNow: string[] = [];

    // A cancelled call must not go on reminding anybody about itself, and a call whose
    // outcome has been marked is over. Done BEFORE queueing this event's own messages,
    // so a cancellation notice is not itself swept away.
    if (type === EventType.APPOINTMENT_CANCELLED) {
      await callOffPending(appointment.id, "The call was cancelled.", ["APPOINTMENT_REMINDER"]);
    }
    if (type === EventType.APPOINTMENT_ATTENDED || type === EventType.APPOINTMENT_NO_SHOW) {
      await callOffPending(appointment.id, "The call is over.", ["APPOINTMENT_REMINDER"]);
    }

    // The automations that match: this workspace, switched on, this trigger, and either
    // every booking link or this one.
    const matching = await prisma.automation.findMany({
      where: {
        tenantId: appointment.tenantId,
        active: true,
        trigger,
        OR: [{ bookingTypeId: null }, { bookingTypeId: appointment.bookingTypeId }],
      },
      select: { id: true },
    });
    for (const a of matching) {
      const id = await queue({
        automationId: a.id,
        appointmentId: appointment.id,
        tenantId: appointment.tenantId,
        dueAt: now,
      });
      if (id) dueNow.push(id);
    }

    // Reminders are scheduled by the events that set or move a call's time.
    if (type === EventType.APPOINTMENT_BOOKED || type === EventType.APPOINTMENT_RESCHEDULED) {
      const reminders = await prisma.automation.findMany({
        where: {
          tenantId: appointment.tenantId,
          active: true,
          trigger: "APPOINTMENT_REMINDER",
          OR: [{ bookingTypeId: null }, { bookingTypeId: appointment.bookingTypeId }],
        },
        select: { id: true, offsetMin: true },
      });
      for (const r of reminders) {
        const dueAt = reminderDueAt(appointment.startAt, r.offsetMin);
        // A day-ahead reminder for a call booked this afternoon is already in the past.
        // Dropping it is right - sending it now would say "your call is tomorrow" to
        // somebody whose call is in two hours - but a row left PENDING in the past would
        // be sent by the cron the moment it ran, so there must not be one.
        if (!isStillAhead(dueAt, now.getTime())) {
          // THIS reminder only. Cancelling by trigger here would take the one-hour
          // reminder down with the day-ahead one every time somebody books the same day.
          await prisma.automationRun
            .updateMany({
              where: { automationId: r.id, appointmentId: appointment.id, status: "PENDING" },
              data: { status: "CANCELLED", skipReason: "Booked too late for this reminder." },
            })
            .catch(() => {});
          continue;
        }
        await queue({
          automationId: r.id,
          appointmentId: appointment.id,
          tenantId: appointment.tenantId,
          dueAt,
        });
      }
    }

    return dueNow;
  } catch (e) {
    console.error(
      `[automation] queueing for ${type} on ${appointmentId} failed:`,
      e instanceof Error ? e.message : String(e),
    );
    return [];
  }
}
