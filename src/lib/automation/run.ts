import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { formatISTDate } from "@/lib/date";
import { sendTrackedEmail, sendWaba } from "@/lib/nurture/send";
import { wabaVisible } from "@/lib/nurture/waba-visible";
import { resolveWabaConfig } from "@/lib/settings/config";
import { fillPlaceholders, toE164Digits, type LeadFields } from "@/features/nurture/config";
import { istMinutesOfDay, minutesToHHMM } from "@/lib/calendar/slots";

/**
 * The automation worker: take what is due, send it, write down what happened.
 *
 * It sends nothing itself. Email goes through sendTrackedEmail and WhatsApp through
 * sendWaba, which are the nurture sender - so there is one place that knows about SMTP,
 * the Cloud API, ZeptoMail's HTTPS fallback and the send log, and automations inherit
 * all of it including the NurtureLog rows an owner already reads.
 *
 * Driven by the cron (scripts/run-automations.ts, every minute) and called inline for
 * runs that are due the moment they are queued, so a booking confirmation does not wait.
 */

/** Two tries after the first, spaced, then it stops and says so. */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [5 * 60_000, 20 * 60_000];

export interface RunSummary {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * The origin for links in an outgoing message.
 *
 * 🔴 A tenant's own domain when they have one, the platform URL otherwise, and NEVER
 * "<slug>.<root domain>". That guess is what put apply-gita.orbitq-assess… into a live
 * screen: a host nobody had created, in a link somebody was asked to click. There is no
 * request to read a host from out here in a cron, so the only honest answers are a
 * domain we know routes, or ours.
 */
async function outboundOrigin(tenantId: string): Promise<string> {
  const domain = await prisma.domain
    .findFirst({
      where: { tenantId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { hostname: true },
    })
    .catch(() => null);
  return domain ? `https://${domain.hostname}` : env.NEXT_PUBLIC_APP_URL;
}

/** Claim one PENDING run for this worker. False when somebody else got there first. */
async function claim(runId: string): Promise<boolean> {
  const claimed = await prisma.automationRun.updateMany({
    where: { id: runId, status: "PENDING" },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });
  return claimed.count > 0;
}

async function skip(runId: string, reason: string): Promise<void> {
  await prisma.automationRun
    .update({ where: { id: runId }, data: { status: "SKIPPED", skipReason: reason } })
    .catch(() => {});
}

async function fail(runId: string, attempts: number, error: string): Promise<void> {
  const backoff = BACKOFF_MS[attempts - 1];
  // Out of tries: stop, and leave the error where the owner can read it. A queue that
  // retries forever is a queue nobody ever looks at.
  const data =
    attempts >= MAX_ATTEMPTS || backoff === undefined
      ? { status: "FAILED" as const, lastError: error.slice(0, 500) }
      : {
          status: "PENDING" as const,
          dueAt: new Date(Date.now() + backoff),
          lastError: error.slice(0, 500),
        };
  await prisma.automationRun.update({ where: { id: runId }, data }).catch(() => {});
}

/**
 * Send one run: every action on its automation, in order.
 *
 * The run is SENT when at least one action reached somebody, SKIPPED when there was
 * nobody to reach (no email on the lead, no mobile for WhatsApp), and FAILED only when
 * sending was attempted and broke - which is the distinction that makes the log worth
 * reading.
 */
export async function processRun(runId: string): Promise<"sent" | "failed" | "skipped"> {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      attempts: true,
      tenantId: true,
      automation: {
        select: {
          id: true,
          name: true,
          active: true,
          trigger: true,
          actions: { orderBy: { displayOrder: "asc" } },
        },
      },
      appointment: {
        select: {
          id: true,
          status: true,
          startAt: true,
          publicToken: true,
          attendeeName: true,
          attendeeEmail: true,
          attendeeMobile: true,
          submissionId: true,
          bookingType: { select: { name: true, slug: true, locationValue: true } },
          submission: {
            select: {
              resultToken: true,
              leadFirstName: true,
              leadLastName: true,
              leadEmail: true,
              leadMobile: true,
              leadProfession: true,
            },
          },
        },
      },
    },
  });
  if (!run) return "skipped";

  const { automation, appointment } = run;

  // Switched off between queueing and coming due. The rule is read HERE rather than at
  // queue time precisely so that switching an automation off stops tomorrow's reminders
  // without anybody having to go and find them.
  if (!automation.active) {
    await skip(run.id, "The automation was switched off.");
    return "skipped";
  }
  if (automation.actions.length === 0) {
    await skip(run.id, "The automation has no messages on it.");
    return "skipped";
  }
  // A call that was called off keeps no appointments with anybody. The cancellation
  // message itself is the exception, since that is the one thing left to say.
  if (appointment.status === "CANCELLED" && automation.trigger !== "APPOINTMENT_CANCELLED") {
    await skip(run.id, "The call was cancelled.");
    return "skipped";
  }

  const lead: LeadFields = {
    firstName: appointment.submission?.leadFirstName ?? (appointment.attendeeName ?? "").split(" ")[0] ?? null,
    lastName: appointment.submission?.leadLastName ?? null,
    email: appointment.submission?.leadEmail ?? appointment.attendeeEmail,
    mobile: appointment.submission?.leadMobile ?? appointment.attendeeMobile,
    profession: appointment.submission?.leadProfession ?? null,
  };

  const origin = await outboundOrigin(run.tenantId);
  const token = appointment.submission?.resultToken ?? "";
  const extra: Record<string, string> = {
    appointmentTime: minutesToHHMM(istMinutesOfDay(appointment.startAt.getTime())),
    appointmentDate: formatISTDate(appointment.startAt),
    bookingName: appointment.bookingType?.name ?? "your call",
    meetingLink: appointment.bookingType?.locationValue ?? "",
    // Their own token rides along, so "pick another time" opens a booking page that
    // already knows who they are instead of asking them to prove it.
    bookingUrl: appointment.bookingType
      ? `${origin}/b/${appointment.bookingType.slug}${token ? `?t=${token}` : ""}`
      : "",
    icsUrl: `${origin}/api/calendar/event/${appointment.publicToken}.ics`,
  };

  let sentAny = false;
  let nobodyToReach = true;
  const errors: string[] = [];

  for (const action of automation.actions) {
    if (action.channel === "EMAIL") {
      const to = (lead.email ?? "").trim();
      if (!to) continue; // no address: nothing to send to, and not a failure
      nobodyToReach = false;
      const err = await sendTrackedEmail(
        run.tenantId,
        appointment.submissionId,
        to,
        fillPlaceholders(action.subject ?? "", lead, extra),
        fillPlaceholders(action.body ?? "", lead, extra),
      );
      if (err) errors.push(`Email: ${err}`);
      else sentAny = true;
      continue;
    }

    // WhatsApp. Parked means parked: a workspace that cannot see the feature must not
    // keep sending through it, the same rule the nurture sender follows.
    if (!(await wabaVisible(run.tenantId))) continue;
    const waba = await resolveWabaConfig(run.tenantId);
    const digits = toE164Digits(lead.mobile, waba.defaultCountryCode);
    if (!digits) continue;
    nobodyToReach = false;
    const vars = (Array.isArray(action.wabaVars) ? (action.wabaVars as unknown[]) : [])
      .map((v) => (typeof v === "string" ? v : ""))
      .map((v) => fillPlaceholders(v, lead, extra));
    const err = await sendWaba(run.tenantId, digits, action.wabaTemplate ?? "", action.wabaLang, vars);
    await prisma.nurtureLog
      .create({
        data: {
          tenantId: run.tenantId,
          submissionId: appointment.submissionId,
          channel: "WABA",
          status: err ? "FAILED" : "SENT",
          toAddress: digits,
          error: err?.slice(0, 500) ?? null,
        },
      })
      .catch(() => {});
    if (err) errors.push(`WhatsApp: ${err}`);
    else sentAny = true;
  }

  if (sentAny) {
    await prisma.automationRun
      .update({
        where: { id: run.id },
        data: {
          status: "SENT",
          firedAt: new Date(),
          lastError: errors.length ? errors.join(" · ").slice(0, 500) : null,
        },
      })
      .catch(() => {});
    return "sent";
  }
  if (errors.length) {
    await fail(run.id, run.attempts, errors.join(" · "));
    return "failed";
  }
  await skip(
    run.id,
    nobodyToReach
      ? "No email address or mobile number on this booking."
      : "Nothing to send on this channel.",
  );
  return "skipped";
}

/** Send the runs whose ids are already known (the ones queued due-now). Never throws. */
export async function processRuns(runIds: string[]): Promise<void> {
  for (const id of runIds) {
    try {
      if (await claim(id)) await processRun(id);
    } catch (e) {
      console.error(`[automation] run ${id} failed:`, e instanceof Error ? e.message : String(e));
    }
  }
}

/**
 * Everything that is due. The cron's whole job.
 *
 * Claims one row at a time with a conditional update, so two workers (the cron and an
 * inline send, or two replicas) can never both send the same message.
 */
export async function runDueAutomations(limit = 50): Promise<RunSummary> {
  const summary: RunSummary = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  const due = await prisma.automationRun.findMany({
    where: { status: "PENDING", dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: limit,
    select: { id: true },
  });

  for (const { id } of due) {
    try {
      if (!(await claim(id))) continue;
      summary.claimed += 1;
      const outcome = await processRun(id);
      summary[outcome] += 1;
    } catch (e) {
      console.error(`[automation] run ${id} failed:`, e instanceof Error ? e.message : String(e));
    }
  }
  return summary;
}
