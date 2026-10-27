import "server-only";
import { prisma } from "@/lib/db/prisma";
import { type EventType, type WorkflowTrigger } from "@prisma/client";
import { contactTenantOf } from "@/lib/contacts/upsert";
import { featureAllowedFor } from "@/lib/features/release";

/**
 * Starting somebody on a workflow.
 *
 * Called from the places where the thing actually happens - a lead becoming a contact,
 * a submission completing - rather than from a shared event bus. That is partly
 * because the bus belongs to another workstream this week, and partly because the
 * honest trigger for "they opted in" is the line that creates the contact, not a
 * notification about it.
 *
 * 🟡 Every call here is best-effort and swallows its own failures. A workflow is
 * something the owner set up to happen afterwards; the opt-in is the thing the
 * business actually needs. The same ordering as contacts: the valuable write lands
 * first, and the convenience on top of it can fail without taking it down.
 */

export interface TriggerContext {
  tenantId: string | null;
  contactId: string;
  /** The assessment this happened on, for workflows scoped to one funnel. */
  assessmentId?: string | null;
  /** The submission behind it, for the placeholders a message can use. */
  subjectId?: string | null;
  /** For BAND_REACHED. */
  bandKey?: string | null;
  /** For TAG_ADDED. */
  tagId?: string | null;
}

/**
 * Queue every published workflow that matches this trigger.
 *
 * Matching is narrow on purpose. A workflow scoped to an assessment fires only on that
 * assessment; one scoped to none fires on all of them. DRAFT and PAUSED never fire,
 * which is what makes a draft safe to edit in front of a live funnel.
 */
export async function fireWorkflowTrigger(trigger: WorkflowTrigger, ctx: TriggerContext): Promise<void> {
  try {
    const tenantId = contactTenantOf(ctx.tenantId);
    // Held back from customers until released. Gated at the queue door as well as at
    // the drain: a feature nobody can see must not quietly build a backlog of people
    // waiting to be messaged, because releasing it would then send all of it at once.
    if (!(await featureAllowedFor("workflows", tenantId))) return;
    const workflows = await prisma.workflow.findMany({
      where: {
        tenantId,
        trigger,
        status: "PUBLISHED",
        // Null means every funnel. A workflow naming a funnel only fires on that one.
        ...(ctx.assessmentId ? { OR: [{ assessmentId: null }, { assessmentId: ctx.assessmentId }] } : {}),
        ...(trigger === "BAND_REACHED" && ctx.bandKey ? { bandKey: ctx.bandKey } : {}),
        ...(trigger === "TAG_ADDED" && ctx.tagId ? { triggerTagId: ctx.tagId } : {}),
      },
      select: { id: true, steps: { select: { id: true }, take: 1 } },
    });

    for (const w of workflows) {
      // A published workflow with no steps is somebody mid-build who hit publish. It
      // queues nothing rather than creating a run that can never finish.
      if (w.steps.length === 0) continue;
      await startRun(w.id, tenantId, ctx);
    }
  } catch (e) {
    console.error("[workflows] trigger failed:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Start one person on one workflow, unless they are already on it.
 *
 * 🔴 THE GUARD USED TO BE A UNIQUE KEY AND IS NOW A QUERY, and the difference is the
 * point. (workflow, contact) unique meant one run per person EVER: a lead who came
 * back the next quarter, booked again and deserved the same follow-up was silently
 * skipped, and the only evidence was an enrolment that did not happen. What was
 * actually wanted is "not while they are still in it", which a unique key cannot say.
 *
 * 🟡 Two requests arriving together can both pass this check and create two runs. That
 * is accepted rather than locked against: the cost is one duplicate sequence in a rare
 * race, and the cure - a unique key - is the bug above. The worker tolerates it.
 */
async function startRun(workflowId: string, tenantId: string, ctx: TriggerContext): Promise<void> {
  const live = await prisma.workflowRun.findFirst({
    where: {
      workflowId,
      contactId: ctx.contactId,
      status: { in: ["PENDING", "SENDING"] },
    },
    select: { id: true },
  });
  if (live) return;

  await prisma.workflowRun.create({
    data: {
      workflowId,
      contactId: ctx.contactId,
      tenantId,
      subjectId: ctx.subjectId ?? null,
      currentStep: 0,
      // Due now. The first step runs on the next worker pass, or inline when the
      // caller chooses to drain immediately.
      dueAt: new Date(),
    },
  });
}

/* ----------------------------------------------- about a workspace --- */

/**
 * Start a TENANT-audience workflow about one workspace.
 *
 * The mirror of the function above, and separate from it on purpose: the subject is a
 * workspace rather than a contact, the owner of the sequence is the platform rather
 * than the workspace it is about, and nothing here is scoped to an assessment or a
 * band. Folding the two together would mean a function whose every line asks which
 * kind it is.
 *
 * 🔴 THE AUDIENCE FILTER IS IN THE QUERY, not left to the trigger value. A LEAD
 * workflow that somehow carried a tenant trigger would otherwise enrol a workspace
 * into a sequence written about a lead, and every placeholder in it would come out
 * blank in a message to a paying customer.
 */
export async function fireTenantWorkflowTrigger(
  trigger: WorkflowTrigger,
  subjectTenantId: string,
): Promise<void> {
  try {
    if (!subjectTenantId) return;
    const workflows = await prisma.workflow.findMany({
      where: { trigger, status: "PUBLISHED", audience: "TENANT" },
      select: { id: true, tenantId: true, steps: { select: { id: true }, take: 1 } },
    });

    for (const w of workflows) {
      if (w.steps.length === 0) continue;
      // 🟡 Released for the workspace that OWNS the sequence - the platform - not for
      // the one being written to. A customer has not been given this feature; they are
      // the subject of it.
      if (!(await featureAllowedFor("workflows", w.tenantId))) continue;

      const live = await prisma.workflowRun.findFirst({
        where: { workflowId: w.id, subjectTenantId, status: { in: ["PENDING", "SENDING"] } },
        select: { id: true },
      });
      if (live) continue;

      await prisma.workflowRun.create({
        data: {
          workflowId: w.id,
          subjectTenantId,
          tenantId: w.tenantId,
          currentStep: 0,
          dueAt: new Date(),
        },
      });
    }
  } catch (e) {
    console.error("[workflows] tenant trigger failed:", e instanceof Error ? e.message : String(e));
  }
}

/* -------------------------------------------------- from the event bus --- */

/**
 * Which event starts which workflow.
 *
 * 🔴 WIRED HERE RATHER THAN AT NINETEEN CALL SITES. Every one of these already travels
 * through emitEvent, which is where the thing actually happened and where the
 * automations are already hooked. Hand-placing a fireWorkflowTrigger beside each
 * emitEvent would work on the day it was written and then rot: somebody adds a new
 * emit path for abandonment, remembers the webhook, and does not remember this.
 *
 * The appointment events are deliberately ABSENT. They fire from lib/calendar/signals,
 * which has the appointment in hand and already calls fireWorkflowTrigger with it;
 * adding them here would enrol everybody twice.
 */
const TRIGGER_FOR_EVENT: Partial<Record<EventType, WorkflowTrigger>> = {
  ASSESSMENT_COMPLETED_PAID: "ASSESSMENT_COMPLETED_PAID",
  ASSESSMENT_COMPLETED_UNPAID: "ASSESSMENT_COMPLETED_UNPAID",
  ASSESSMENT_ABANDONED: "ASSESSMENT_ABANDONED",
  RESULT_GENERATED: "RESULT_GENERATED",
  RESULT_VIEWED: "RESULT_VIEWED",
  RESULT_LINK_REQUESTED: "RESULT_LINK_REQUESTED",
  CTA_CLICKED: "CTA_CLICKED",
};

/**
 * Start whatever this event starts.
 *
 * Everything it needs hangs off the submission: who the contact is, which funnel it
 * was, which workspace owns it. An event with no submission reaches nobody and
 * returns, which is right - a workflow sends to a person, and there is not one.
 */
export async function enqueueWorkflowsForEvent(
  type: EventType,
  submissionId: string | null | undefined,
): Promise<void> {
  const trigger = TRIGGER_FOR_EVENT[type];
  if (!trigger || !submissionId) return;
  try {
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, contactId: true, assessmentId: true, tenantId: true },
    });
    // No contact means the submission had neither an email nor a mobile to match on,
    // so there is nobody to enrol. Not an error, and not worth a log line per view.
    if (!sub?.contactId) return;
    await fireWorkflowTrigger(trigger, {
      tenantId: sub.tenantId,
      contactId: sub.contactId,
      assessmentId: sub.assessmentId,
      subjectId: sub.id,
    });
  } catch (e) {
    console.error("[workflows] event enqueue failed:", e instanceof Error ? e.message : String(e));
  }
}
