import "server-only";
import { prisma } from "@/lib/db/prisma";
import { featureAllowedFor } from "@/lib/features/release";
import { type WorkflowStep } from "@prisma/client";
import { sendEmail, sendWaba } from "@/lib/nurture/send";
import { fillPlaceholders, toE164Digits, type LeadFields } from "@/features/nurture/config";
import { isSuppressed, unsubscribeUrlFor } from "@/lib/contacts/dnd";
import { defaultCountryCodeFor } from "@/lib/contacts/upsert";
import { resolveRecipient } from "@/lib/workflows/subject";
import { dueAfter, isStale } from "@/lib/workflows/schedule";

/**
 * The worker: take the runs that are due, do the next step, decide when the one after
 * is due.
 *
 * A run is a cursor, not a script. It holds the person, the workflow and the index of
 * the next step, and every pass moves it forward by one. That is what makes a sequence
 * survive a deploy halfway through: the state is a row, and whichever process is alive
 * next picks it up.
 *
 * 🔴 SUPPRESSION IS CHECKED HERE, per step, not once when the run starts. Somebody
 * unsubscribing on day two must not receive day three, and a run that began before
 * they opted out is exactly the case a start-time check would get wrong.
 */

const MAX_ATTEMPTS = 3;
/** How many due runs one pass will take. Keeps a backlog from becoming one long query. */
const BATCH = 50;

export interface RunOutcome {
  claimed: number;
  advanced: number;
  finished: number;
  failed: number;
}

export async function runDueWorkflows(now: Date = new Date()): Promise<RunOutcome> {
  const out: RunOutcome = { claimed: 0, advanced: 0, finished: 0, failed: 0 };

  const due = await prisma.workflowRun.findMany({
    where: { status: "PENDING", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: BATCH,
    select: { id: true, tenantId: true },
  });

  for (const { id, tenantId } of due) {
    // 🔴 THE KILL SWITCH HAS TO BITE HERE. Switching workflows back off is how a
    // half-working sequence is stopped, and a run queued while it was on would
    // otherwise keep sending. Skipped BEFORE the claim, so the row stays PENDING and
    // the person resumes where they were if it is switched on again - nobody is
    // dropped, and nobody gets a message from a feature that was pulled.
    if (!(await featureAllowedFor("workflows", tenantId))) continue;
    // Claim it before doing anything. Two workers (the cron and an inline drain) can
    // overlap, and the claim is what stops one person getting a message twice.
    const claim = await prisma.workflowRun.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) continue;
    out.claimed++;
    try {
      const done = await advanceOne(id, now);
      if (done) out.finished++;
      else out.advanced++;
    } catch (e) {
      out.failed++;
      const message = e instanceof Error ? e.message : String(e);
      const run = await prisma.workflowRun.findUnique({ where: { id }, select: { attempts: true } });
      const attempts = (run?.attempts ?? 0) + 1;
      await prisma.workflowRun.update({
        where: { id },
        data:
          attempts >= MAX_ATTEMPTS
            ? { status: "FAILED", attempts, lastError: message.slice(0, 500), finishedAt: new Date() }
            : // Back to PENDING with the due time pushed out, so a transient failure
              // retries instead of stranding somebody mid-sequence.
              {
                status: "PENDING",
                attempts,
                lastError: message.slice(0, 500),
                dueAt: new Date(now.getTime() + attempts * 5 * 60_000),
              },
      });
    }
  }
  return out;
}

/** Do one step. Returns true when the run is finished. */
async function advanceOne(runId: string, now: Date): Promise<boolean> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      tenantId: true,
      currentStep: true,
      dueAt: true,
      subjectId: true,
      workflowId: true,
      contactId: true,
      subjectTenantId: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          mobile: true,
          profession: true,
          optOutToken: true,
          marketingOptOutAt: true,
        },
      },
      workflow: {
        select: {
          status: true,
          steps: { orderBy: { displayOrder: "asc" } },
        },
      },
    },
  });
  if (!run) return true;

  // The workflow is re-read every pass rather than trusted from when the run started.
  // Switching one off has to stop tomorrow's steps without anybody hunting down the
  // runs already queued.
  if (run.workflow.status !== "PUBLISHED") {
    await stop(runId, "The workflow was switched off.");
    return true;
  }

  const steps = run.workflow.steps;
  const step = steps[run.currentStep];
  if (!step) {
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "DONE", finishedAt: now },
    });
    return true;
  }

  // Who this run is writing to: a contact, or the owner of the workspace being
  // nurtured. Resolved once rather than at each of the four places below that need it.
  const who = await resolveRecipient(run);
  if (!who) {
    // Not a failure to retry. The contact was deleted, or the workspace has no login
    // left to write to, and neither improves by trying again in a minute.
    await stop(runId, "Nobody left to send this to.");
    return true;
  }

  if (step.kind === "DELAY") {
    // A delay does not wait; it SETS the next due time and hands the run back to the
    // queue. Nothing sleeps, so nothing is lost to a restart.
    const next = dueAfter(now, step.delayAmount ?? 0, step.delayUnit ?? "MINUTES");
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: next, attempts: 0 },
    });
    return false;
  }

  if (step.kind === "TAG") {
    // 🟡 A tenant-nurture run has no contact to tag. Skipped with a reason rather than
    // failed: the rest of the sequence is still worth sending.
    if (who.taggable && who.contactId) await applyTag(step, who.contactId, run.tenantId);
    else await logSend(run.tenantId, run.workflowId, step, null, "SKIPPED", null, "Nothing to tag on a workspace.");
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: now, attempts: 0 },
    });
    return false;
  }

  // MESSAGE. Too late to be worth sending? Recorded rather than sent.
  //
  // The case this exists for: the run was paused mid-sequence - the feature held back,
  // or the drain stopped - and comes back long after this step was due. Sending it
  // then delivers a message whose timing was the point. The step is SKIPPED and the
  // sequence carries on, so nobody is dropped out of it for having been late.
  if (isStale(run.dueAt, now)) {
    await logSend(run.tenantId, run.workflowId, step, who.contactId, "SKIPPED", null, "Overdue - not sent.");
    await bump(step.id, "skippedCount");
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: now, attempts: 0 },
    });
    return false;
  }

  // MESSAGE. The suppression check is per step and per send.
  const suppressed =
    who.optedOut || (await isSuppressed(run.tenantId, { email: who.email, mobile: who.mobile }));
  if (suppressed) {
    await logSend(run.tenantId, run.workflowId, step, who.contactId, "SKIPPED", null, "Unsubscribed.");
    await prisma.workflowStep.update({
      where: { id: step.id },
      data: { skippedCount: { increment: 1 } },
    });
    // The whole run stops, not just this step. Somebody who left has left; walking
    // them silently through the remaining five steps so the counters look tidy would
    // be the product pretending it did not hear.
    await stop(runId, "They unsubscribed.");
    return true;
  }

  await sendStep(step, run.tenantId, run.workflowId, {
    id: who.contactId,
    firstName: who.firstName,
    lastName: who.lastName,
    email: who.email,
    mobile: who.mobile,
    profession: who.profession,
    optOutToken: who.optOutToken,
  });

  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: now, attempts: 0 },
  });
  return false;
}

async function stop(runId: string, reason: string) {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "CANCELLED", stopReason: reason, finishedAt: new Date() },
  });
}

async function applyTag(step: WorkflowStep, contactId: string, tenantId: string) {
  if (!step.tagId || !step.tagAction) return;
  // The tag is verified against the tenant every time: a plain id on the step means a
  // deleted tag is possible, and a step pointing at one is a no-op rather than a crash.
  const tag = await prisma.tag.findFirst({
    where: { id: step.tagId, tenantId },
    select: { id: true },
  });
  if (!tag) return;
  if (step.tagAction === "ADD") {
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      update: {},
      create: { contactId, tagId: tag.id },
    });
  } else {
    await prisma.contactTag.deleteMany({ where: { contactId, tagId: tag.id } });
  }
}

interface SendContact extends LeadFields {
  /// Null on a tenant-nurture run: the send is logged without a contact, because there
  /// is not one. Everything else a message needs is the same either way.
  id: string | null;
  optOutToken: string;
}

async function sendStep(step: WorkflowStep, tenantId: string, workflowId: string, contact: SendContact) {
  const unsubscribeUrl = await unsubscribeUrlFor(tenantId, contact.optOutToken);
  const extra = { unsubscribeUrl };
  const channel = step.channel ?? "EMAIL";

  if (channel === "EMAIL") {
    const to = (contact.email ?? "").trim();
    if (!to) {
      await logSend(tenantId, workflowId, step, contact.id, "SKIPPED", null, "No email address.");
      await bump(step.id, "skippedCount");
      return;
    }
    const err = await sendEmail(
      tenantId,
      to,
      fillPlaceholders(step.subject ?? "", contact, extra),
      fillPlaceholders(step.body ?? "", contact, extra),
    );
    await logSend(tenantId, workflowId, step, contact.id, err ? "FAILED" : "SENT", to, err);
    await bump(step.id, err ? "failedCount" : "sentCount");
    return;
  }

  const cc = await defaultCountryCodeFor(tenantId);
  const digits = toE164Digits(contact.mobile, cc);
  if (!digits) {
    await logSend(tenantId, workflowId, step, contact.id, "SKIPPED", null, "No usable mobile number.");
    await bump(step.id, "skippedCount");
    return;
  }
  const vars = Array.isArray(step.wabaVars)
    ? (step.wabaVars as unknown[]).map((v) => fillPlaceholders(typeof v === "string" ? v : "", contact, extra))
    : [];
  const err = await sendWaba(tenantId, digits, step.wabaTemplate ?? "", step.wabaLang, vars);
  await logSend(tenantId, workflowId, step, contact.id, err ? "FAILED" : "SENT", digits, err);
  await bump(step.id, err ? "failedCount" : "sentCount");
}

async function bump(stepId: string, field: "sentCount" | "failedCount" | "skippedCount") {
  await prisma.workflowStep.update({ where: { id: stepId }, data: { [field]: { increment: 1 } } });
}

async function logSend(
  tenantId: string,
  workflowId: string,
  step: WorkflowStep,
  /// Null on a tenant-nurture run: there is no contact, and the log says so.
  contactId: string | null,
  status: string,
  toAddress: string | null,
  error: string | null,
) {
  await prisma.workflowSend.create({
    data: {
      tenantId,
      workflowId,
      stepId: step.id,
      contactId,
      channel: step.channel ?? "EMAIL",
      status,
      toAddress,
      error: error?.slice(0, 500) ?? null,
    },
  });
}
