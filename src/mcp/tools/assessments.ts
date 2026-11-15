import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { publicOriginFor } from "@/lib/tenant/public-origin";
import { testLinkUrl } from "@/lib/funnel/test-link";
import { audienceGateSchema, qualificationSchema, readExits } from "@/features/assessment/schemas";
import { defineTool, ToolError, type ToolDef } from "@/mcp/core/types";
import { idInput, tenantWhere } from "@/mcp/tools/shared";

const listAssessments = defineTool({
  name: "list_assessments",
  title: "List assessments",
  description: "The funnels (assessments) in this workspace: id, title, slug, status, public link, lead counts.",
  access: "read",
  input: z.object({
    status: z.enum(["DRAFT", "PUBLISHED", "all"]).default("all"),
    search: z.string().trim().max(80).optional().describe("Filter by title or slug."),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  run: async (ctx, input) => {
    const rows = await prisma.assessment.findMany({
      where: {
        ...tenantWhere(ctx),
        ...(input.status === "all" ? {} : { status: input.status }),
        ...(input.search
          ? { OR: [{ title: { contains: input.search, mode: "insensitive" } }, { slug: { contains: input.search, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        engine: true,
        leadCaptureMode: true,
        nextStep: true,
        fireMetaCapi: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { categories: true, submissions: true } },
      },
    });
    const origin = await publicOriginFor(ctx.workspace.id);
    return {
      workspace: ctx.workspace.name,
      count: rows.length,
      assessments: rows.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        status: a.status,
        public_url: `${origin}/a/${a.slug}`,
        engine: a.engine,
        lead_capture: a.leadCaptureMode,
        ending: a.nextStep,
        meta_reporting: a.fireMetaCapi,
        categories: a._count.categories,
        submissions: a._count.submissions,
        published: a.publishedAt,
        created: a.createdAt,
        updated: a.updatedAt,
      })),
    };
  },
});

const getAssessment = defineTool({
  name: "get_assessment",
  title: "Get assessment (all questions)",
  description:
    "One funnel in full: settings, the audience gate, the qualification gate questions with every answer's points and outcome, the gate exits, every assessment category with its questions, options, points and routing, and the result bands.",
  access: "read",
  input: z.object({ assessment_id: idInput }),
  run: async (ctx, input) => {
    const a = await prisma.assessment.findFirst({
      where: { id: input.assessment_id, ...tenantWhere(ctx) },
      include: {
        categories: {
          orderBy: { displayOrder: "asc" },
          include: {
            questions: {
              orderBy: { displayOrder: "asc" },
              include: { options: { orderBy: { displayOrder: "asc" }, include: { route: true } } },
            },
            bands: { orderBy: { displayOrder: "asc" } },
          },
        },
        resultBands: { orderBy: { displayOrder: "asc" } },
        resultsDoc: { select: { id: true, title: true, published: true } },
        vslDoc: { select: { id: true, title: true, published: true } },
        _count: { select: { submissions: true } },
      },
    });
    if (!a) throw new ToolError("No assessment with that id in this workspace. Call list_assessments.");

    const gate = qualificationSchema.safeParse(a.qualification ?? {});
    const audience = a.audienceGate ? audienceGateSchema.safeParse(a.audienceGate) : null;
    const exits = readExits(a.disqualifiedContent);
    const origin = await publicOriginFor(ctx.workspace.id);

    return {
      id: a.id,
      title: a.title,
      slug: a.slug,
      status: a.status,
      public_url: `${origin}/a/${a.slug}`,
      // Every owner test goes through this link, never public_url: it is flagged as a
      // test everywhere, loads no browser pixel and sends no production event to Meta.
      test_link: (() => {
        const t = testLinkUrl(origin, a.slug, a.id);
        return { url: t.url, expires: t.expiresAt, note: "Give the owner this link for test runs. Never ask them to test on public_url." };
      })(),
      headline: { eyebrow: a.eyebrow, subheadline: a.subheadline, description: a.description },
      engine: a.engine,
      display_mode: a.questionDisplayMode,
      ending: a.nextStep,
      target_url: a.targetUrl,
      lead_capture: {
        mode: a.leadCaptureMode,
        after_assessment: a.leadCaptureAfter,
        fields: {
          first_name: { collect: a.collectFirstName, required: a.firstNameRequired },
          last_name: { collect: a.collectLastName, required: a.lastNameRequired },
          email: { collect: a.collectEmail, required: a.emailRequired },
          mobile: { collect: a.collectMobile, required: a.mobileRequired },
          profession: { collect: a.collectProfession, required: a.professionRequired, options: a.professionOptions },
        },
        extra_optin_fields: a.optinFields,
        pre_result_fields: a.preResultFields,
      },
      retake: { policy: a.retakePolicy, days: a.retakeDays, identifier: a.uniqueIdentifier },
      meta: { reporting_on: a.fireMetaCapi, events: a.metaEvents, ad_account_id: a.adAccountId },
      ai_statement: { on: a.useAiStatement, prompt_version_id: a.aiPromptVersionId },
      payment: a.paidMode ? { url: a.paymentUrl, amount: a.paymentAmount, event: a.paymentEventName } : null,
      audience_gate: audience ? (audience.success ? audience.data : a.audienceGate) : null,
      qualification_gate: gate.success ? gate.data : { unreadable: true, raw: a.qualification },
      gate_exits: exits,
      categories: a.categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        page: c.page,
        bands: c.bands.map((b) => ({ label: b.label, meaning: b.meaning, min: b.minScore, max: b.maxScore })),
        questions: c.questions.map((q) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          required: q.required,
          weight: q.weight,
          role: q.scoringRole,
          default_route: q.defaultRouteAction
            ? { action: q.defaultRouteAction, to_question: q.defaultTargetQuestionId, to_category: q.defaultTargetCategoryId }
            : null,
          options: q.options.map((o) => ({
            id: o.id,
            label: o.label,
            points: o.value,
            clause: o.diagnosisClause,
            route: o.route ? { action: o.route.action, to_question: o.route.targetQuestionId, to_category: o.route.targetCategoryId } : null,
          })),
        })),
      })),
      result_bands: a.resultBands.map((b) => ({ id: b.id, level: b.level, title: b.title, description: b.description, min: b.minScore, max: b.maxScore })),
      result_pages: { results: a.resultsDoc, vsl: a.vslDoc },
      submissions: a._count.submissions,
      published: a.publishedAt,
      created: a.createdAt,
      updated: a.updatedAt,
    };
  },
});

export const ASSESSMENT_TOOLS: ToolDef[] = [listAssessments, getAssessment];
