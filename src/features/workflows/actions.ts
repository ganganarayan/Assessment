"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { syncEdges } from "@/lib/workflows/edges";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { contactTenantOf } from "@/lib/contacts/upsert";
import { featureDenied } from "@/lib/features/release";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  createWorkflowSchema,
  publishProblems,
  stepSchema,
  workflowSettingsSchema,
  type WorkflowStepView,
} from "@/features/workflows/types";

/**
 * Editing workflows.
 *
 * Every action resolves the acting scope, refuses view-only staff, checks the release
 * gate, and then checks that the row being touched belongs to this workspace. The
 * scope alone is never enough: ids arrive from a browser, and "may edit workflows" is
 * a different question from "may edit THIS workflow".
 */

type Scoped = { ok: true; tenantId: string } | { ok: false; result: ActionResult };

async function scoped(): Promise<Scoped> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return { ok: false, result: denied };
  if (!scope.tenantId && !scope.isSuper) {
    return { ok: false, result: { ok: false, error: "No workspace." } };
  }
  // Held back from customers: the pages are guarded too, but an action that trusted
  // the page would be one stale tab away from writing anyway.
  const held = await featureDenied("workflows", scope.tenantId);
  if (held) return { ok: false, result: held };
  return { ok: true, tenantId: contactTenantOf(scope.tenantId) };
}

function refresh(id?: string) {
  revalidatePath("/admin/workflows");
  revalidatePath("/w/workflows");
  if (id) {
    revalidatePath(`/admin/workflows/${id}`);
    revalidatePath(`/w/workflows/${id}`);
  }
}

/** Does this workflow belong to the caller's workspace? */
async function own(tenantId: string, id: string) {
  return prisma.workflow.findFirst({ where: { id, tenantId }, select: { id: true, status: true } });
}

export async function createWorkflow(input: unknown): Promise<ActionResult<{ id: string }>> {
  const s = await scoped();
  if (!s.ok) return s.result;
  const parsed = createWorkflowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the name and trigger." };
  }
  // DRAFT by default, from the schema. A workflow that could send on the day it was
  // created would make "let me just try it" an outgoing message to real people.
  const w = await prisma.workflow.create({
    data: { tenantId: s.tenantId, name: parsed.data.name, trigger: parsed.data.trigger },
    select: { id: true },
  });
  refresh();
  return { ok: true, data: { id: w.id } };
}

export async function updateWorkflowSettings(input: unknown): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  const parsed = workflowSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const { id, name, assessmentId, bandKey, triggerTagId } = parsed.data;
  if (!(await own(s.tenantId, id))) return { ok: false, error: "That workflow is not in this workspace." };

  // The assessment and tag are verified against the workspace before being stored.
  // They are plain ids on the row, so nothing downstream would catch a foreign one.
  if (assessmentId) {
    const a = await prisma.assessment.findFirst({
      where: s.tenantId === "platform" ? { id: assessmentId } : { id: assessmentId, tenantId: s.tenantId },
      select: { id: true },
    });
    if (!a) return { ok: false, error: "That assessment is not in this workspace." };
  }
  if (triggerTagId) {
    const t = await prisma.tag.findFirst({ where: { id: triggerTagId, tenantId: s.tenantId }, select: { id: true } });
    if (!t) return { ok: false, error: "That tag is not in this workspace." };
  }

  await prisma.workflow.update({
    where: { id },
    data: {
      name,
      assessmentId: assessmentId || null,
      bandKey: bandKey || null,
      triggerTagId: triggerTagId || null,
    },
  });
  refresh(id);
  return { ok: true };
}

export async function addWorkflowStep(
  workflowId: string,
  kind: "MESSAGE" | "DELAY" | "TAG",
  /**
   * Where to put it. Undefined appends, which is what every caller meant before the
   * canvas had a + between boxes. 0 puts it immediately after the trigger.
   */
  atIndex?: number,
): Promise<ActionResult<{ id: string }>> {
  const s = await scoped();
  if (!s.ok) return s.result;
  if (!(await own(s.tenantId, workflowId))) return { ok: false, error: "That workflow is not in this workspace." };

  const existing = await prisma.workflowStep.findMany({
    where: { workflowId },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });
  // Clamped rather than trusted: the index comes from a screen that may be a moment
  // behind the data, and an out-of-range insert would silently land somewhere else.
  const at =
    atIndex === undefined ? existing.length : Math.max(0, Math.min(Math.trunc(atIndex), existing.length));

  // 🔴 SHIFT FIRST, THEN INSERT. Writing the new step at an occupied displayOrder and
  // tidying up afterwards leaves two steps sharing a position in between, and the
  // runner's cursor is that position - a run landing there mid-insert would take the
  // wrong step. The gap is opened before anything occupies it.
  if (at < existing.length) {
    await prisma.workflowStep.updateMany({
      where: { workflowId, displayOrder: { gte: at } },
      data: { displayOrder: { increment: 1 } },
    });
  }
  const order = at;

  const created = await prisma.workflowStep.create({
    data: {
      workflowId,
      displayOrder: order,
      kind,
      // Sensible starting points, so a new step is a thing you edit rather than a
      // blank that has to be filled before it means anything.
      ...(kind === "MESSAGE" ? { channel: "EMAIL" as const } : {}),
      ...(kind === "DELAY" ? { delayAmount: 1, delayUnit: "DAYS" as const } : {}),
      ...(kind === "TAG" ? { tagAction: "ADD" as const } : {}),
    },
  });
  await syncEdges(workflowId);
  refresh(workflowId);
  // The id travels back so the builder can select the box it just made. Adding a step
  // and being left to find it is the small friction that makes a builder feel inert.
  return { ok: true, data: { id: created.id } };
}

export async function updateWorkflowStep(workflowId: string, input: unknown): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  if (!(await own(s.tenantId, workflowId))) return { ok: false, error: "That workflow is not in this workspace." };
  const parsed = stepSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check this step." };
  }
  const v = parsed.data;
  const step = await prisma.workflowStep.findFirst({
    where: { id: v.id, workflowId },
    select: { id: true },
  });
  if (!step) return { ok: false, error: "That step is not in this workflow." };

  if (v.tagId) {
    const t = await prisma.tag.findFirst({ where: { id: v.tagId, tenantId: s.tenantId }, select: { id: true } });
    if (!t) return { ok: false, error: "That tag is not in this workspace." };
  }

  await prisma.workflowStep.update({
    where: { id: v.id },
    data: {
      channel: v.channel,
      subject: v.subject,
      body: v.body,
      wabaTemplate: v.wabaTemplate,
      wabaLang: v.wabaLang || "en",
      wabaVars: v.wabaVars,
      delayAmount: v.delayAmount,
      delayUnit: v.delayUnit,
      tagId: v.tagId || null,
      tagAction: v.tagAction,
    },
  });
  refresh(workflowId);
  return { ok: true };
}

/**
 * Move a step up or down.
 *
 * A swap of two rows rather than a renumber of all of them: the sends log is keyed on
 * the step id and the counters live on the row, so reordering must never recreate a
 * step. Somebody who moves a message up should keep its history.
 */
export async function moveWorkflowStep(workflowId: string, stepId: string, direction: -1 | 1): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  if (!(await own(s.tenantId, workflowId))) return { ok: false, error: "That workflow is not in this workspace." };

  const steps = await prisma.workflowStep.findMany({
    where: { workflowId },
    orderBy: { displayOrder: "asc" },
    select: { id: true, displayOrder: true },
  });
  const i = steps.findIndex((x) => x.id === stepId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= steps.length) return { ok: true };

  const a = steps[i]!;
  const b = steps[j]!;
  await prisma.$transaction([
    prisma.workflowStep.update({ where: { id: a.id }, data: { displayOrder: b.displayOrder } }),
    prisma.workflowStep.update({ where: { id: b.id }, data: { displayOrder: a.displayOrder } }),
  ]);
  await syncEdges(workflowId);
  refresh(workflowId);
  return { ok: true };
}

export async function deleteWorkflowStep(workflowId: string, stepId: string): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  if (!(await own(s.tenantId, workflowId))) return { ok: false, error: "That workflow is not in this workspace." };
  await prisma.workflowStep.deleteMany({ where: { id: stepId, workflowId } });
  // Close the gap, so the order stays 0..n and the runner's cursor cannot point at a
  // hole. Runs already past this point are unaffected; one still waiting on the
  // deleted step lands on whatever now occupies that position.
  const rest = await prisma.workflowStep.findMany({
    where: { workflowId },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });
  await prisma.$transaction(
    rest.map((r, idx) => prisma.workflowStep.update({ where: { id: r.id }, data: { displayOrder: idx } })),
  );
  await syncEdges(workflowId);
  refresh(workflowId);
  return { ok: true };
}

/**
 * Publish, or take it back off.
 *
 * Publishing is the moment a draft starts messaging real people, so the server runs
 * the same checks the screen does rather than trusting that it did. Unpublishing is
 * never refused: stopping something is not a privilege.
 */
export async function setWorkflowStatus(id: string, publish: boolean): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  if (!(await own(s.tenantId, id))) return { ok: false, error: "That workflow is not in this workspace." };

  if (!publish) {
    await prisma.workflow.update({ where: { id }, data: { status: "PAUSED" } });
    refresh(id);
    return { ok: true };
  }

  const w = await prisma.workflow.findUnique({
    where: { id },
    select: {
      trigger: true,
      bandKey: true,
      triggerTagId: true,
      steps: { orderBy: { displayOrder: "asc" } },
    },
  });
  if (!w) return { ok: false, error: "That workflow is not in this workspace." };

  const problems = publishProblems({
    trigger: w.trigger,
    bandKey: w.bandKey,
    triggerTagId: w.triggerTagId,
    steps: w.steps.map((x) => ({
      ...x,
      subject: x.subject ?? "",
      body: x.body ?? "",
      wabaTemplate: x.wabaTemplate ?? "",
      wabaVars: [],
    })) as WorkflowStepView[],
  });
  if (problems.length) return { ok: false, error: problems.join(" ") };

  await prisma.workflow.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  refresh(id);
  return { ok: true };
}

/**
 * Delete a workflow.
 *
 * Its runs go with it, which is the honest behaviour: the sequence they were walking
 * through no longer exists, so there is nothing for them to be partway through. The
 * UI says how many people that is before asking.
 */
export async function deleteWorkflow(id: string): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  if (!(await own(s.tenantId, id))) return { ok: false, error: "That workflow is not in this workspace." };
  await prisma.workflow.delete({ where: { id } });
  refresh();
  return { ok: true };
}
