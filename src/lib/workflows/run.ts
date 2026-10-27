import "server-only";
import { prisma } from "@/lib/db/prisma";
import { featureAllowedFor } from "@/lib/features/release";
import { type WorkflowStep } from "@prisma/client";
import { sendEmail, sendWaba } from "@/lib/nurture/send";
import { fillPlaceholders, toE164Digits, type LeadFields } from "@/features/nurture/config";
import { isSuppressed, unsubscribeUrlFor } from "@/lib/contacts/dnd";
import { defaultCountryCodeFor } from "@/lib/contacts/upsert";
import { resolveRecipient } from "@/lib/workflows/subject";
import { deliverWebhook } from "@/lib/webhooks/dispatch";
import { createLooseZoomMeeting } from "@/lib/zoom/meetings";
import { sendAndLogLifecycleCapi } from "@/lib/meta/capi-log";
import { randomUUID } from "node:crypto";
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
      meetingLink: true,
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

  // 🔴 EXIT stops the run where it stands, and every step after it never happens.
  // Worth having in a straight line even without branching: it is how the tail of a
  // sequence is parked without deleting the steps and losing what they said.
  if (step.kind === "EXIT") {
    await stop(runId, "A step ended the sequence here.");
    return true;
  }

  if (step.kind === "UNSUBSCRIBE") {
    // 🟡 Only a contact can be unsubscribed. On a tenant-nurture run this is skipped
    // rather than silently doing nothing to a workspace, because "we took them off the
    // list" and "we did not" must not look the same in the log.
    if (who.contactId) {
      await prisma.contact
        .update({
          where: { id: who.contactId },
          data: { marketingOptOutAt: new Date(), optOutSource: "WORKFLOW" },
        })
        .catch(() => {});
      await logSend(run.tenantId, run.workflowId, step, who.contactId, "SENT", null, null);
    } else {
      await logSend(run.tenantId, run.workflowId, step, null, "SKIPPED", null, "A workspace has no marketing consent to withdraw.");
    }
    // Carries on rather than stopping. The suppression check at the top of the next
    // MESSAGE step is what ends the run, and letting it do that keeps one rule in one
    // place instead of two that can disagree.
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: now, attempts: 0 },
    });
    return false;
  }

  if (step.kind === "SUBFLOW") {
    await runSubflow(step, run.tenantId, run.workflowId, who.contactId);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: now, attempts: 0 },
    });
    return false;
  }

  if (step.kind === "WEBHOOK") {
    await fireStepWebhook(step, run.tenantId, run.workflowId, who);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: now, attempts: 0 },
    });
    return false;
  }

  if (step.kind === "NOTIFY_OWNER") {
    await notifyOwner(step, run.tenantId, run.workflowId, who);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: now, attempts: 0 },
    });
    return false;
  }

  if (step.kind === "ZOOM_MEETING") {
    const topic = fillPlaceholders(step.zoomTopic?.trim() || "Call with {{firstName}}", lead(who), {});
    const made = await createLooseZoomMeeting({ tenantId: run.tenantId, topic });
    if ("error" in made) {
      await logSend(run.tenantId, run.workflowId, step, who.contactId, "FAILED", null, made.error);
    } else {
      // 🔴 Written to the RUN, which is what every later step reads {{meetingLink}} from.
      // Without this the link exists only in Zoom and nothing can say it.
      await prisma.workflowRun
        .update({ where: { id: runId }, data: { meetingLink: made.joinUrl } })
        .catch(() => {});
      run.meetingLink = made.joinUrl;
      await logSend(run.tenantId, run.workflowId, step, who.contactId, "SENT", made.joinUrl, null);
    }
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: now, attempts: 0 },
    });
    return false;
  }

  if (step.kind === "CAPI_EVENT") {
    await fireCapiStep(step, run.tenantId, run.workflowId, run.subjectId, who);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "PENDING", currentStep: run.currentStep + 1, dueAt: now, attempts: 0 },
    });
    return false;
  }

  // 🟡 BRANCH and LOOP have no handler, and the builder offers none of
  // them. A row carrying one did not come from this product, so it is logged and
  // stepped over rather than crashing a sequence somebody else is halfway through.
  if (step.kind !== "MESSAGE") {
    await logSend(run.tenantId, run.workflowId, step, who.contactId, "SKIPPED", null, `Nothing here knows how to run a ${step.kind} step.`);
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
    meetingLink: run.meetingLink,
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
  /// The Zoom link this run made, if a ZOOM_MEETING step ran above. Null otherwise,
  /// which leaves {{meetingLink}} visible in the message rather than blank - a
  /// placeholder that silently empties is how a message goes out saying "join here:".
  meetingLink?: string | null;
  /// Null on a tenant-nurture run: the send is logged without a contact, because there
  /// is not one. Everything else a message needs is the same either way.
  id: string | null;
  optOutToken: string;
}

async function sendStep(step: WorkflowStep, tenantId: string, workflowId: string, contact: SendContact) {
  const unsubscribeUrl = await unsubscribeUrlFor(tenantId, contact.optOutToken);
  const extra = {
    unsubscribeUrl,
    ...(contact.meetingLink ? { meetingLink: contact.meetingLink } : {}),
  };
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

/**
 * Fire one Meta conversion for the person going through this sequence.
 *
 * 🔴 WHAT THIS IS FOR, beyond reporting. Meta builds custom audiences from the events
 * it receives, so a sequence that fires StartTrial and later Purchase is also building
 * the retargeting and exclusion lists in Ads Manager without anybody uploading
 * anything. That is why there is no separate "add to audience" step: the audience is a
 * consequence of the event, not a thing to maintain.
 *
 * 🔴 THE EVENT ID IS FRESH EVERY TIME AND THAT IS CORRECT HERE. Dedup against the
 * browser pixel exists so one real-world moment reported twice counts once; a workflow
 * step is a moment the browser was never present for, so there is nothing to collide
 * with. Reusing an id across people would make Meta count the whole sequence once.
 *
 * 🟡 Sent through the SAME sender and log as the funnel, so a workflow conversion shows
 * up in the CAPI log beside every other one rather than in a place nobody checks.
 */
async function fireCapiStep(
  step: WorkflowStep,
  tenantId: string,
  workflowId: string,
  submissionId: string | null,
  who: { contactId: string | null; email: string | null; mobile: string | null; firstName: string | null; lastName: string | null },
) {
  const eventName = step.capiEventName?.trim();
  if (!eventName) {
    await logSend(tenantId, workflowId, step, who.contactId, "SKIPPED", null, "No event chosen.");
    return;
  }
  // 🟡 Matching needs something to match ON. Meta accepts an event with no user data
  // and attributes it to nobody, which is worse than not sending: it inflates the
  // count and teaches the ad account nothing.
  if (!who.email && !who.mobile) {
    await logSend(tenantId, workflowId, step, who.contactId, "SKIPPED", null, "No email or mobile to match on.");
    return;
  }

  // 🔴 A PREVIEW MUST NOT REACH META, AND A WORKFLOW IS HOW IT NEARLY DID. Everything
  // else about a preview run is real on purpose - the submission, the pixel, the
  // webhook - so a preview booking enrols a contact like any other and walks the same
  // sequence. Without this the owner testing their own funnel would fire a live
  // conversion, and Meta would learn to find more people like them. The submission is
  // the only thing that knows, so it is asked.
  let preview = false;
  if (submissionId) {
    const sub = await prisma.submission
      .findUnique({ where: { id: submissionId }, select: { isPreview: true } })
      .catch(() => null);
    preview = sub?.isPreview === true;
  }
  if (preview) {
    await logSend(tenantId, workflowId, step, who.contactId, "SKIPPED", eventName, "Preview run - not sent to Meta.");
    return;
  }

  const outcome = await sendAndLogLifecycleCapi(
    {
      eventName,
      eventId: randomUUID(),
      eventTimeMs: Date.now(),
      user: {
        email: who.email,
        phone: who.mobile,
        firstName: who.firstName,
        lastName: who.lastName,
      },
    },
    {
      tenantId,
      submissionId,
      // The workspace default. A sequence is not bound to one funnel, so there is no
      // funnel-specific ad account to read - unlike a submission, which has one.
      adAccountId: null,
      name: [who.firstName, who.lastName].filter(Boolean).join(" ") || null,
    },
  );

  await logSend(
    tenantId,
    workflowId,
    step,
    who.contactId,
    outcome.ok ? "SENT" : "FAILED",
    eventName,
    outcome.ok ? null : (outcome.error ?? "Meta refused the event."),
  );
}

/** The lead fields a placeholder can use, from whichever subject this run has. */
function lead(who: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  profession: string | null;
}): LeadFields {
  return {
    firstName: who.firstName,
    lastName: who.lastName,
    email: who.email,
    mobile: who.mobile,
    profession: who.profession,
  };
}

/**
 * Hand somebody to another sequence.
 *
 * 🔴 THE TARGET IS CHECKED AGAINST THIS WORKSPACE EVERY TIME. A step holds a plain id,
 * and a workflow moved or deleted since the step was written would otherwise be a way
 * to enrol one tenant's contact into another tenant's sequence.
 *
 * 🟡 No loop guard beyond "already running". Two sequences that call each other settle
 * because the enroller refuses a second run while one is live, so the pair bounces once
 * and stops rather than running away.
 */
async function runSubflow(
  step: WorkflowStep,
  tenantId: string,
  workflowId: string,
  contactId: string | null,
) {
  if (!step.targetWorkflowId) {
    await logSend(tenantId, workflowId, step, contactId, "SKIPPED", null, "No sequence chosen.");
    return;
  }
  if (!contactId) {
    await logSend(tenantId, workflowId, step, null, "SKIPPED", null, "Only a contact can be handed to another sequence.");
    return;
  }
  const target = await prisma.workflow.findFirst({
    where: { id: step.targetWorkflowId, tenantId, status: "PUBLISHED" },
    select: { id: true, steps: { select: { id: true }, take: 1 } },
  });
  if (!target || target.steps.length === 0) {
    await logSend(tenantId, workflowId, step, contactId, "SKIPPED", null, "That sequence is gone, empty or not published.");
    return;
  }
  const live = await prisma.workflowRun.findFirst({
    where: { workflowId: target.id, contactId, status: { in: ["PENDING", "SENDING"] } },
    select: { id: true },
  });
  if (live) {
    await logSend(tenantId, workflowId, step, contactId, "SKIPPED", null, "They are already in that sequence.");
    return;
  }
  await prisma.workflowRun.create({
    data: { workflowId: target.id, contactId, tenantId, currentStep: 0, dueAt: new Date() },
  });
  await logSend(tenantId, workflowId, step, contactId, "SENT", null, null);
}

/** POST this person to one of the workspace's registered endpoints. */
async function fireStepWebhook(
  step: WorkflowStep,
  tenantId: string,
  workflowId: string,
  who: { contactId: string | null; email: string | null; mobile: string | null; firstName: string | null; lastName: string | null },
) {
  if (!step.webhookId) {
    await logSend(tenantId, workflowId, step, who.contactId, "SKIPPED", null, "No endpoint chosen.");
    return;
  }
  // Scoped to the workspace, like every other id on a step.
  const hook = await prisma.webhook.findFirst({
    where: { id: step.webhookId, tenantId },
    select: { url: true, secret: true },
  });
  if (!hook) {
    await logSend(tenantId, workflowId, step, who.contactId, "SKIPPED", null, "That endpoint is gone.");
    return;
  }
  // deliverWebhook takes the body already serialised, because what it signs has to be
  // byte-for-byte what it sends. Serialising it twice is how a signature stops matching.
  const res = await deliverWebhook({
    url: hook.url,
    secret: hook.secret,
    eventName: "workflow.step",
    tenantId,
    body: JSON.stringify({
      event: "workflow.step",
      workflowId,
      stepId: step.id,
      contact: {
        id: who.contactId,
        email: who.email,
        mobile: who.mobile,
        firstName: who.firstName,
        lastName: who.lastName,
      },
    }),
  });
  await logSend(
    tenantId,
    workflowId,
    step,
    who.contactId,
    res.success ? "SENT" : "FAILED",
    hook.url,
    res.success ? null : `Endpoint answered ${res.responseStatus ?? "nothing"}.`,
  );
}

/**
 * Tell the OWNER, not the person in the sequence.
 *
 * 🔴 THE RECIPIENT IS THE WHOLE POINT AND THE EASIEST THING TO GET WRONG. Every other
 * step on this screen writes to the lead. This one writes to whoever runs the
 * workspace, which is why it does not go near the suppression check: an owner who once
 * unsubscribed from a newsletter has not asked to stop being told that a lead just
 * scored 90.
 */
async function notifyOwner(
  step: WorkflowStep,
  tenantId: string,
  workflowId: string,
  who: { contactId: string | null; firstName: string | null; lastName: string | null; email: string | null; mobile: string | null; profession: string | null; optOutToken: string },
) {
  const owner = await prisma.user.findFirst({
    where: { tenantId, deletedAt: null, staffPermission: null },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  if (!owner?.email) {
    await logSend(tenantId, workflowId, step, who.contactId, "SKIPPED", null, "No owner login to notify.");
    return;
  }
  const lead: LeadFields = {
    firstName: who.firstName,
    lastName: who.lastName,
    email: who.email,
    mobile: who.mobile,
    profession: who.profession,
  };
  // The placeholders still describe the LEAD, which is what makes the notification
  // worth reading: "{{firstName}} just finished" is the message, sent to the owner.
  const subject = fillPlaceholders(step.subject?.trim() || "A workflow wants you to know", lead, {});
  const body = fillPlaceholders(step.body ?? "", lead, {});
  const err = await sendEmail(tenantId, owner.email, subject, body);
  await logSend(tenantId, workflowId, step, who.contactId, err ? "FAILED" : "SENT", owner.email, err);
}
