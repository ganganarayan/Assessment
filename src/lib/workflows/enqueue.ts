import "server-only";
import { prisma } from "@/lib/db/prisma";
import { type WorkflowTrigger } from "@prisma/client";
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

