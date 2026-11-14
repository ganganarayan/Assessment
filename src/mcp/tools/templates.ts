import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { resolvePlan } from "@/lib/billing/plan-resolve";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { isPlatformTenant } from "@/lib/tenant/platform-tenant";
import { publicOriginFor } from "@/lib/tenant/public-origin";
import { listAllTemplates, listTemplatesForTenant } from "@/features/templates/data";
import { parseTemplateBody } from "@/features/templates/schema";
import { importTemplate } from "@/features/templates/actions/library";
import { qualificationSchema } from "@/features/assessment/schemas";
import { defineTool, ToolError, unwrapAction, type ToolContext, type ToolDef } from "@/mcp/core/types";
import { idInput } from "@/mcp/tools/shared";

/** Owner at home sees the whole library; anyone inside a workspace sees what it may import. */
function ownerAtHome(ctx: ToolContext): boolean {
  return ctx.identity.isOwner && isPlatformTenant(ctx.workspace.id);
}

async function visibleTemplate(ctx: ToolContext, templateId: string) {
  const t = await prisma.template.findFirst({
    where: ownerAtHome(ctx)
      ? { id: templateId }
      : {
          id: templateId,
          OR: [{ ownerTenantId: null, published: true, reviewStatus: "APPROVED" }, { ownerTenantId: ctx.workspace.id }],
        },
    select: { id: true, slug: true, title: true, category: true, summary: true, shape: true, body: true, aiInstructions: true, published: true },
  });
  if (!t) throw new ToolError("That template is not available to this workspace. Call list_templates.");
  return t;
}

const listTemplates = defineTool({
  name: "list_templates",
  title: "List templates",
  description: "The template library this workspace can build from: id, title, category, summary, shape. Pass an id to get_template for its questions.",
  access: "read",
  input: z.object({ category: z.string().trim().max(80).optional() }),
  run: async (ctx, input) => {
    const items = ownerAtHome(ctx) ? await listAllTemplates() : await listTemplatesForTenant(ctx.workspace.id);
    const filtered = input.category ? items.filter((t) => t.category.toLowerCase().includes(input.category!.toLowerCase())) : items;
    return {
      count: filtered.length,
      templates: filtered.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        summary: t.summary,
        shape: t.shape,
        built_in: t.builtin,
        yours: t.mine,
        private: t.isPrivate,
        published: t.published,
      })),
    };
  },
});

const getTemplate = defineTool({
  name: "get_template",
  title: "Get template (all questions)",
  description: "One template in full: its gate questions with points and outcomes, every assessment category and question with options and points, and the result bands.",
  access: "read",
  input: z.object({ template_id: idInput }),
  run: async (ctx, input) => {
    const t = await visibleTemplate(ctx, input.template_id);
    const body = parseTemplateBody(t.body);
    if (!body.success) return { id: t.id, title: t.title, unreadable: true };
    const b = body.data;
    const gate = qualificationSchema.safeParse(b.qualification ?? {});
    return {
      id: t.id,
      title: t.title,
      category: t.category,
      summary: t.summary,
      shape: t.shape,
      suggested_ai_instructions: t.aiInstructions,
      audience_gate: b.audienceGate ?? null,
      qualification_gate: gate.success ? gate.data : b.qualification ?? null,
      categories: b.categories,
      result_bands: b.resultBands,
    };
  },
});

const importInput = z.object({
  template_id: idInput,
  result_page_kind: z.enum(["RESULTS", "VSL"]).optional().describe("When the template carries both result pages, which one to bring."),
});

const createFromTemplate = defineTool({
  name: "create_assessment_from_template",
  title: "Create assessment from template",
  description:
    "Make a new DRAFT funnel in this workspace from a template, exactly like Import on the Templates page. Meta reporting starts OFF and nothing is published.",
  access: "write",
  input: importInput,
  preview: async (ctx, input) => {
    const t = await visibleTemplate(ctx, input.template_id);
    const body = parseTemplateBody(t.body);
    const plan = await resolvePlan(ctx.workspace.id);
    const cap = ctx.identity.isOwner ? { ok: true as const } : await assertCanCreateAssessment(ctx.workspace.id);
    const gate = body.success ? qualificationSchema.safeParse(body.data.qualification ?? {}) : null;
    return {
      action: "Create a new draft assessment from this template",
      template: { id: t.id, title: t.title, category: t.category },
      contents: body.success
        ? {
            gate_questions: gate?.success ? gate.data.questions.length : 0,
            categories: body.data.categories.length,
            questions: body.data.categories.reduce((n, c) => n + c.questions.length, 0),
            result_bands: body.data.resultBands.length,
          }
        : "the template body could not be read; the import will refuse",
      result_page: input.result_page_kind ?? "whatever the template carries",
      will_be: "DRAFT, Meta reporting OFF, not published",
      plan_check: plan.parked
        ? "REFUSED: the workspace is paused"
        : cap.ok
          ? "OK, within the plan's assessment limit"
          : `REFUSED: plan limit of ${cap.limit} assessments reached (${cap.used} used)`,
    };
  },
  run: async (ctx, input) => {
    const out = unwrapAction(await importTemplate(input.template_id, input.result_page_kind ?? null)) as {
      assessmentId: string;
      slug: string;
      promptVersionLabel: string | null;
    };
    const origin = await publicOriginFor(ctx.workspace.id);
    return {
      assessment_id: out.assessmentId,
      slug: out.slug,
      status: "DRAFT",
      ai_prompt_version_created: out.promptVersionLabel,
      builder: `${origin}${ctx.identity.isOwner && isPlatformTenant(ctx.workspace.id) ? "/admin" : "/w"}/assessments/${out.assessmentId}`,
      next: "Review it with get_assessment. Publishing is done through run_app_action (assessment.setAssessmentStatus) with its own preview.",
    };
  },
});

export const TEMPLATE_TOOLS: ToolDef[] = [listTemplates, getTemplate, createFromTemplate];
