import "server-only";
import { prisma } from "@/lib/db/prisma";
import { type WorkflowTrigger } from "@prisma/client";
import { contactTenantOf } from "@/lib/contacts/upsert";

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
 * One person, one workflow, one run - ever.
 *
 * createMany with skipDuplicates rather than an upsert: the unique key is doing the
 * work, and the intent here is "start them if they have never been started". An upsert
 * would quietly reset somebody who is three days into the sequence back to step zero
 * the next time they filled in a form.
 */
async function startRun(workflowId: string, tenantId: string, ctx: TriggerContext): Promise<void> {
  await prisma.workflowRun.createMany({
    data: [
      {
        workflowId,
        contactId: ctx.contactId,
        tenantId,
        subjectId: ctx.subjectId ?? null,
        currentStep: 0,
        // Due now. The first step runs on the next worker pass, or inline when the
        // caller chooses to drain immediately.
        dueAt: new Date(),
      },
    ],
    skipDuplicates: true,
  });
}
