import "server-only";
import { buildEventChoices } from "@/lib/meta/event-catalog";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { contactTenantOf } from "@/lib/contacts/upsert";
import { resolveWabaConfig } from "@/lib/settings/config";
import { wabaVisible } from "@/lib/nurture/waba-visible";
import { fetchWabaTemplates } from "@/features/nurture/actions";
import type { BuilderOptions, WorkflowListRow, WorkflowStepView, WorkflowView } from "@/features/workflows/types";

/** Reading workflows. Scoped by the acting tenant, resolved by the caller. */

function stepView(s: {
  id: string;
  displayOrder: number;
  kind: WorkflowStepView["kind"];
  channel: WorkflowStepView["channel"];
  subject: string | null;
  body: string | null;
  wabaTemplate: string | null;
  wabaLang: string;
  wabaVars: unknown;
  delayAmount: number | null;
  delayUnit: WorkflowStepView["delayUnit"];
  tagId: string | null;
  tagAction: WorkflowStepView["tagAction"];
  targetWorkflowId: string | null;
  webhookId: string | null;
  zoomTopic: string | null;
  capiEventName: string | null;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}): WorkflowStepView {
  return {
    id: s.id,
    displayOrder: s.displayOrder,
    kind: s.kind,
    channel: s.channel,
    subject: s.subject ?? "",
    body: s.body ?? "",
    wabaTemplate: s.wabaTemplate ?? "",
    wabaLang: s.wabaLang,
    wabaVars: Array.isArray(s.wabaVars) ? (s.wabaVars as unknown[]).map((v) => (typeof v === "string" ? v : "")) : [],
    delayAmount: s.delayAmount,
    delayUnit: s.delayUnit,
    tagId: s.tagId,
    tagAction: s.tagAction,
    targetWorkflowId: s.targetWorkflowId,
    webhookId: s.webhookId,
    zoomTopic: s.zoomTopic,
    capiEventName: s.capiEventName,
    sentCount: s.sentCount,
    failedCount: s.failedCount,
    skippedCount: s.skippedCount,
  };
}

export async function listWorkflows(scopeTenantId: string | null): Promise<WorkflowListRow[]> {
  const tenantId = contactTenantOf(scopeTenantId);
  const rows = await prisma.workflow.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      triggers: { orderBy: { displayOrder: "asc" }, select: { trigger: true } },
      _count: { select: { steps: true } },
      runs: { where: { status: "PENDING" }, select: { id: true } },
    },
  });
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    triggers: w.triggers.map((t) => t.trigger),
    status: w.status,
    stepCount: w._count.steps,
    activeRuns: w.runs.length,
    createdAt: formatIST(w.createdAt),
  }));
}

export async function getWorkflow(scopeTenantId: string | null, id: string): Promise<WorkflowView | null> {
  const tenantId = contactTenantOf(scopeTenantId);
  const w = await prisma.workflow.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      name: true,
      status: true,
      audience: true,
      allowReentry: true,
      triggers: { orderBy: { displayOrder: "asc" } },
      steps: { orderBy: { displayOrder: "asc" } },
    },
  });
  if (!w) return null;

  const [activeRuns, doneRuns] = await Promise.all([
    prisma.workflowRun.count({ where: { workflowId: id, status: "PENDING" } }),
    prisma.workflowRun.count({ where: { workflowId: id, status: "DONE" } }),
  ]);

  return {
    id: w.id,
    name: w.name,
    status: w.status,
    audience: w.audience,
    allowReentry: w.allowReentry,
    triggers: w.triggers.map((t) => ({
      id: t.id,
      trigger: t.trigger,
      assessmentId: t.assessmentId,
      bandKey: t.bandKey,
      tagId: t.tagId,
      displayOrder: t.displayOrder,
    })),
    steps: w.steps.map(stepView),
    activeRuns,
    doneRuns,
  };
}

/**
 * What the builder offers in its dropdowns.
 *
 * WhatsApp is offered only when the workspace can actually send on it: the feature
 * released to them AND a number connected. Offering a channel that will skip every
 * send is how somebody writes a four-step sequence that silently does nothing.
 */
export async function builderOptions(scopeTenantId: string | null): Promise<BuilderOptions> {
  const tenantId = contactTenantOf(scopeTenantId);
  const [assessments, tags, waba, visible, workflows, zoom, webhooks] = await Promise.all([
    prisma.assessment.findMany({
      where: tenantId === "platform" ? { OR: [{ tenantId: null }, { tenantId }] } : { tenantId },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.tag.findMany({ where: { tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    resolveWabaConfig(scopeTenantId),
    wabaVisible(scopeTenantId),
    // Only PUBLISHED sequences can be handed to. A draft would accept people and never
    // send, which is the quietest way to lose a lead there is.
    prisma.workflow.findMany({
      where: { tenantId, status: "PUBLISHED" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.zoomAccount.findUnique({ where: { tenantId }, select: { tenantId: true } }),
    prisma.webhook.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const wabaAvailable = visible && !!waba.phoneNumberId && !!waba.accessToken;
  // Templates come from Meta and the call can fail. A failure means an empty list and
  // a free-text box, never a broken page: the template name is typed by hand if the
  // picker cannot load.
  let wabaTemplates: BuilderOptions["wabaTemplates"] = [];
  if (wabaAvailable) {
    try {
      const r = await fetchWabaTemplates();
      if (r.ok && r.data) wabaTemplates = r.data.map((t) => ({ name: t.name, varCount: t.varCount }));
    } catch {
      wabaTemplates = [];
    }
  }

  return {
    assessments,
    tags,
    wabaTemplates,
    wabaAvailable,
    workflows,
    webhooks,
    zoomConnected: !!zoom,
    // The whole vocabulary: what the funnel fires, then Meta's own standard names.
    // The owner asked for everything for now and will narrow it once the shape is clear.
    capiEvents: buildEventChoices(),
  };
}
