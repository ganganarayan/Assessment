import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { defineTool, ToolError, type ToolDef } from "@/mcp/core/types";
import {
  adParamInput,
  assessmentInWorkspace,
  attributionValue,
  dateInput,
  fullName,
  idInput,
  reportingWindow,
  tenantWhere,
} from "@/mcp/tools/shared";

const listLeads = defineTool({
  name: "list_leads",
  title: "List leads",
  description:
    "Leads (submissions) in this workspace, newest first: name, email, mobile, funnel, status, score, band, ad id and source. Test runs are excluded unless include_test_runs is true. Same reporting window as the Submissions page.",
  access: "read",
  input: z.object({
    assessment_id: idInput.optional(),
    from: dateInput.optional(),
    to: dateInput.optional(),
    status: z.enum(["STARTED", "COMPLETED", "all"]).default("all"),
    band: z.string().trim().max(80).optional().describe("Result band title or level (LOW, MEDIUM, HIGH, CRITICAL)."),
    search: z.string().trim().max(120).optional().describe("Name, email or mobile contains."),
    ad_id: z.string().trim().max(200).optional(),
    ad_param: adParamInput,
    include_test_runs: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
    cursor: z.string().trim().max(64).optional().describe("next_cursor from the previous page."),
  }),
  run: async (ctx, input) => {
    const a = input.assessment_id ? await assessmentInWorkspace(ctx, input.assessment_id) : null;
    const win = await reportingWindow(ctx, { from: input.from, to: input.to }, a);
    const band = input.band?.toUpperCase();
    const rows = await prisma.submission.findMany({
      where: {
        ...tenantWhere(ctx),
        ...(a ? { assessmentId: a.id } : {}),
        ...(win.createdAt ? { createdAt: win.createdAt } : {}),
        ...(input.status === "all" ? {} : { status: input.status }),
        ...(input.include_test_runs ? {} : { isPreview: false }),
        ...(input.ad_id ? { attribution: { path: [input.ad_param], equals: input.ad_id } } : {}),
        ...(band
          ? {
              resultBand: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(band)
                ? { level: band as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }
                : { title: { contains: input.band, mode: "insensitive" as const } },
            }
          : {}),
        ...(input.search
          ? {
              OR: [
                { leadFirstName: { contains: input.search, mode: "insensitive" as const } },
                { leadLastName: { contains: input.search, mode: "insensitive" as const } },
                { leadEmail: { contains: input.search, mode: "insensitive" as const } },
                { leadMobile: { contains: input.search } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        isPreview: true,
        leadFirstName: true,
        leadLastName: true,
        leadEmail: true,
        leadMobile: true,
        leadProfession: true,
        audienceRole: true,
        totalScore: true,
        maxScore: true,
        gateScore: true,
        gateMax: true,
        gateBand: true,
        attribution: true,
        country: true,
        city: true,
        createdAt: true,
        completedAt: true,
        assessment: { select: { id: true, title: true } },
        resultBand: { select: { level: true, title: true } },
      },
    });
    const page = rows.slice(0, input.limit);
    return {
      count: page.length,
      next_cursor: rows.length > input.limit ? page[page.length - 1]?.id ?? null : null,
      leads: page.map((s) => ({
        id: s.id,
        name: fullName(s.leadFirstName, s.leadLastName),
        email: s.leadEmail,
        mobile: s.leadMobile,
        profession: s.leadProfession,
        audience: s.audienceRole,
        funnel: s.assessment.title,
        assessment_id: s.assessment.id,
        status: s.status,
        test_run: s.isPreview,
        score: s.totalScore,
        max_score: s.maxScore,
        band: s.resultBand ? `${s.resultBand.title} (${s.resultBand.level})` : null,
        gate: s.gateMax ? { score: s.gateScore, max: s.gateMax, band: s.gateBand } : null,
        ad_id: attributionValue(s.attribution, input.ad_param),
        source: attributionValue(s.attribution, "utm_source"),
        campaign: attributionValue(s.attribution, "utm_campaign"),
        location: [s.city, s.country].filter(Boolean).join(", ") || null,
        created: s.createdAt,
        completed: s.completedAt,
      })),
    };
  },
});

const getLead = defineTool({
  name: "get_lead",
  title: "Get lead",
  description:
    "One lead in full: contact details, every answer with its question and points, category scores, result band, gate result, attribution, the AI statement and report note.",
  access: "read",
  input: z.object({ lead_id: idInput }),
  run: async (ctx, input) => {
    const s = await prisma.submission.findFirst({
      where: { id: input.lead_id, ...tenantWhere(ctx) },
      include: {
        assessment: { select: { id: true, title: true, slug: true } },
        resultBand: { select: { level: true, title: true, description: true } },
        categoryScores: { include: { category: { select: { name: true, displayOrder: true } } } },
        answers: {
          include: {
            question: { select: { text: true, displayOrder: true, category: { select: { name: true, displayOrder: true } } } },
            option: { select: { label: true, value: true } },
          },
        },
        aiStatements: { orderBy: { createdAt: "desc" }, take: 3, select: { text: true, source: true, isDefault: true, createdAt: true } },
      },
    });
    if (!s) throw new ToolError("No lead with that id in this workspace. Call list_leads.");
    const answers = [...s.answers].sort(
      (x, y) =>
        x.question.category.displayOrder - y.question.category.displayOrder || x.question.displayOrder - y.question.displayOrder,
    );
    return {
      id: s.id,
      funnel: s.assessment,
      status: s.status,
      test_run: s.isPreview,
      contact: {
        name: fullName(s.leadFirstName, s.leadLastName),
        email: s.leadEmail,
        mobile: s.leadMobile,
        profession: s.leadProfession,
        audience: s.audienceRole,
        contact_id: s.contactId,
      },
      extra_answers: { optin: s.optinAnswers, pre_result: s.preResultAnswers },
      score: { total: s.totalScore, max: s.maxScore },
      band: s.resultBand,
      category_scores: [...s.categoryScores]
        .sort((x, y) => x.category.displayOrder - y.category.displayOrder)
        .map((c) => ({ category: c.category.name, score: c.score, max: c.maxScore })),
      answers: answers.map((x) => ({
        category: x.question.category.name,
        question: x.question.text,
        answer: x.option?.label ?? x.textValue,
        points: x.option ? x.option.value : null,
      })),
      gate: {
        score: s.gateScore,
        max: s.gateMax,
        band: s.gateBand,
        exit: s.gateExitKey,
        answers: s.qualificationAnswers,
        breakdown: s.gateBreakdown,
      },
      ai_statement: s.aiStatement,
      ai_statement_history: s.aiStatements,
      report_note: s.reportNote,
      attribution: s.attribution,
      location: { city: s.city, region: s.region, country: s.country },
      device: { type: s.deviceType, browser: s.browser, os: s.os },
      video: { max_watched_pct: s.vslMaxPct, seconds: s.vslWatchSeconds },
      started: s.startedAt,
      completed: s.completedAt,
      result_viewed: s.resultViewedAt,
      created: s.createdAt,
    };
  },
});

const listGateQualified = defineTool({
  name: "list_gate_qualified",
  title: "List gate-qualified leads",
  description:
    "Split lead capture funnels: people who passed the gate and gave an email before answering the assessment (the Gate qualified screen). submission_id is set once they registered.",
  access: "read",
  input: z.object({
    assessment_id: idInput.optional(),
    from: dateInput.optional(),
    to: dateInput.optional(),
    include_test_runs: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  run: async (ctx, input) => {
    const a = input.assessment_id ? await assessmentInWorkspace(ctx, input.assessment_id) : null;
    const win = await reportingWindow(ctx, { from: input.from, to: input.to }, a);
    const rows = await prisma.gateEntry.findMany({
      where: {
        ...tenantWhere(ctx),
        ...(a ? { assessmentId: a.id } : {}),
        emailCapturedAt: { not: null, ...(win.createdAt ?? {}) },
        ...(input.include_test_runs ? {} : { isPreview: false }),
      },
      orderBy: { emailCapturedAt: "desc" },
      take: input.limit,
      select: {
        id: true,
        leadFirstName: true,
        leadLastName: true,
        leadEmail: true,
        audienceRole: true,
        gateScore: true,
        gateMax: true,
        gateBand: true,
        submissionId: true,
        emailCapturedAt: true,
        isPreview: true,
        attribution: true,
        assessment: { select: { id: true, title: true } },
      },
    });
    return {
      count: rows.length,
      leads: rows.map((g) => ({
        id: g.id,
        name: fullName(g.leadFirstName, g.leadLastName),
        email: g.leadEmail,
        audience: g.audienceRole,
        funnel: g.assessment.title,
        gate: { score: g.gateScore, max: g.gateMax, band: g.gateBand },
        registered_submission_id: g.submissionId,
        test_run: g.isPreview,
        utm_content: attributionValue(g.attribution, "utm_content"),
        captured: g.emailCapturedAt,
      })),
    };
  },
});

export const LEAD_TOOLS: ToolDef[] = [listLeads, getLead, listGateQualified];
