import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAnalyticsStats, getUtmBreakdown } from "@/features/admin/data/analytics";
import { defineTool, type ToolDef, type ToolContext } from "@/mcp/core/types";
import {
  AD_COLUMN,
  adParamInput,
  assessmentInWorkspace,
  attributionValue,
  appDateRange,
  dateInput,
  idInput,
  reportingWindow,
  tenantWhere,
  type AdParam,
} from "@/mcp/tools/shared";

/**
 * Funnel numbers. Without an ad filter they come from the SAME function the Stats page uses
 * (getAnalyticsStats), so the chat and the screen never disagree. Test runs (preview
 * submissions and preview gate passes) are then reported beside the real numbers, not
 * inside them.
 *
 * With an ad id, the five core numbers are counted here, filtered on the utm parameter the
 * ads put the ad id in. There is no ad id column: fbclid and fbc are opaque click tokens and
 * do not contain it, so ads must carry utm_content={{ad.id}} (or another utm parameter).
 */

const statsInput = z.object({
  assessment_id: idInput.optional().describe("One funnel. Omit for the whole workspace."),
  from: dateInput.optional(),
  to: dateInput.optional(),
  ad_id: z.string().trim().min(1).max(200).optional().describe("Only traffic and leads from this ad id."),
  ad_param: adParamInput,
  breakdown: z.enum(["none", "ad"]).default("none").describe("ad = the core numbers per ad id."),
});

type Window = { createdAt?: { gte?: Date; lte?: Date } };

function rekey(w: Window, field: string): Record<string, unknown> {
  return w.createdAt ? { [field]: w.createdAt } : {};
}

/** Owner test runs (?preview=1 or the signed test link), counted apart from real traffic.
 *  adFilter matches the json attribution (submissions, gate passes); flatFilter the utm
 *  columns (page views, gate rejections). */
async function testRuns(
  ctx: ToolContext,
  w: Window,
  assessmentId: string | undefined,
  adFilter: Record<string, unknown>,
  flatFilter: Record<string, unknown> = {},
) {
  const one = { ...(assessmentId ? { assessmentId } : {}), isPreview: true };
  const [visits, turnedAway, optins, completed, gatePassed] = await Promise.all([
    prisma.pageView.count({ where: { ...tenantWhere(ctx), ...one, ...flatFilter, ...w } }),
    prisma.gateDisqualification.count({ where: { ...tenantWhere(ctx), ...one, ...flatFilter, ...w, repeat: false } }),
    prisma.submission.count({ where: { ...tenantWhere(ctx), ...one, ...adFilter, ...w } }),
    prisma.submission.count({ where: { ...tenantWhere(ctx), ...one, ...adFilter, ...w, status: "COMPLETED" } }),
    prisma.gateEntry.count({ where: { ...tenantWhere(ctx), ...one, ...adFilter, ...rekey(w, "passedAt") } }),
  ]);
  return { visits, turned_away: turnedAway, opt_ins: optins, completed, gate_passed: gatePassed };
}

function jsonPath(param: AdParam, adId: string) {
  return { attribution: { path: [param], equals: adId } };
}

async function adFilteredCore(ctx: ToolContext, w: Window, assessmentId: string | undefined, param: AdParam, adId: string) {
  const col = AD_COLUMN[param];
  const scope = { ...tenantWhere(ctx), ...(assessmentId ? { assessmentId } : {}) };
  const flat = { [col]: adId };
  const json = jsonPath(param, adId);
  const [views, unique, disqualified, gatePassed, optins, completed] = await Promise.all([
    prisma.pageView.count({ where: { ...scope, ...w, isBot: false, isPreview: false, ...flat } }),
    prisma.pageView.findMany({ where: { ...scope, ...w, isBot: false, isPreview: false, ...flat }, select: { visitorId: true }, distinct: ["visitorId"] }),
    prisma.gateDisqualification.count({ where: { ...scope, ...w, repeat: false, isBot: false, isPreview: false, ...flat } }),
    prisma.gateEntry.count({ where: { ...scope, ...rekey(w, "passedAt"), isPreview: false, ...json } }),
    prisma.submission.count({ where: { ...scope, ...w, isPreview: false, ...json } }),
    prisma.submission.count({ where: { ...scope, ...w, isPreview: false, status: "COMPLETED", ...json } }),
  ]);
  return {
    visits: { total: views, unique: unique.length },
    gate_passed: gatePassed,
    disqualified,
    opt_ins: optins,
    completed,
    test_runs: await testRuns(ctx, w, assessmentId, json, flat),
  };
}

const MAX_ROWS = 20000;

async function byAd(ctx: ToolContext, w: Window, assessmentId: string | undefined, param: AdParam) {
  const col = AD_COLUMN[param];
  const scope = { ...tenantWhere(ctx), ...(assessmentId ? { assessmentId } : {}) };
  const [views, dq, entries, subs] = await Promise.all([
    prisma.pageView.groupBy({ by: [col], where: { ...scope, ...w, isBot: false, isPreview: false }, _count: { _all: true } }),
    prisma.gateDisqualification.groupBy({ by: [col], where: { ...scope, ...w, repeat: false, isBot: false, isPreview: false }, _count: { _all: true } }),
    prisma.gateEntry.findMany({ where: { ...scope, ...rekey(w, "passedAt"), isPreview: false }, select: { attribution: true }, take: MAX_ROWS }),
    prisma.submission.findMany({ where: { ...scope, ...w, isPreview: false }, select: { attribution: true, status: true }, take: MAX_ROWS }),
  ]);
  const NONE = "(no ad id)";
  const rows = new Map<string, { ad_id: string; visits: number; gate_passed: number; disqualified: number; opt_ins: number; completed: number }>();
  const row = (k: string | null) => {
    const key = k ?? NONE;
    let r = rows.get(key);
    if (!r) {
      r = { ad_id: key, visits: 0, gate_passed: 0, disqualified: 0, opt_ins: 0, completed: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const v of views) row((v as Record<string, unknown>)[col] as string | null).visits += v._count._all;
  for (const d of dq) row((d as Record<string, unknown>)[col] as string | null).disqualified += d._count._all;
  for (const e of entries) row(attributionValue(e.attribution, param)).gate_passed += 1;
  for (const s of subs) {
    const r = row(attributionValue(s.attribution, param));
    r.opt_ins += 1;
    if (s.status === "COMPLETED") r.completed += 1;
  }
  const list = [...rows.values()].sort((a, b) => b.visits - a.visits || b.opt_ins - a.opt_ins);
  return {
    ad_param: param,
    ads: list.slice(0, 100),
    more: Math.max(0, list.length - 100),
    capped: entries.length >= MAX_ROWS || subs.length >= MAX_ROWS,
  };
}

const getFunnelStats = defineTool({
  name: "get_funnel_stats",
  title: "Funnel stats",
  description:
    "Visits, gate passed, disqualified (by exit), opt-ins, completed, payments and Meta events fired, for the workspace or one funnel, over a date range, optionally for one ad id or broken down by ad id. Test runs (preview) are reported separately from real numbers. Same numbers as the Stats page.",
  access: "read",
  input: statsInput,
  run: async (ctx, input) => {
    const a = input.assessment_id ? await assessmentInWorkspace(ctx, input.assessment_id) : null;
    const win = await reportingWindow(ctx, { from: input.from, to: input.to }, a);
    const w: Window = win.createdAt ? { createdAt: win.createdAt } : {};
    const window = { from: win.createdAt?.gte ?? null, to: win.createdAt?.lte ?? null, reporting_start: win.floor };
    const funnel = a ? { id: a.id, title: a.title } : "all funnels in this workspace";

    if (input.ad_id) {
      return { funnel, window, ad: { param: input.ad_param, id: input.ad_id }, ...(await adFilteredCore(ctx, w, a?.id, input.ad_param, input.ad_id)) };
    }

    const s = await getAnalyticsStats(appDateRange({ from: input.from, to: input.to }), ctx.workspace.scope, a ? { assessmentId: a.id, floor: a.statsResetAt } : undefined);
    const tests = await testRuns(ctx, w, a?.id, {});
    const out = {
      funnel,
      window,
      visits: { total: s.totalViews, unique: s.uniqueViews, test_runs: tests.visits, note: "Real visits: humans only; bots, Meta ad review and owner test runs are excluded." },
      gate_passed: { all: s.qualified + tests.gate_passed, real: s.qualified, test_runs: tests.gate_passed },
      disqualified: {
        turned_away: s.disqualified,
        routed_to_another_path: s.routedOn,
        repeat_visits_by_already_rejected: s.disqualifiedRepeat,
        by_exit: s.byExit,
        test_runs: tests.turned_away,
        note: "turned_away, repeat visits and by_exit are real rejections only; test_runs counts owner test rejections, never sent to Meta.",
      },
      dropped_after_gate: { left_at_optin: s.leftOptin, never_reached_optin: s.gateIncomplete },
      opt_ins: { all: s.optins, real: Math.max(0, s.optins - tests.opt_ins), test_runs: tests.opt_ins },
      completed: { all: s.completed, real: Math.max(0, s.completed - tests.completed), test_runs: tests.completed },
      result_page_loads: s.vslLoads,
      payments: {
        assessment_unlocks: { count: s.paidCount, amount: s.paidAmount },
        product_sales: { count: s.productSaleCount, amount: s.productSaleAmount },
      },
      meta_events_fired: s.fired,
    };
    if (input.breakdown === "ad") return { ...out, by_ad: await byAd(ctx, w, a?.id, input.ad_param) };
    return out;
  },
});

const getTrafficSources = defineTool({
  name: "get_traffic_sources",
  title: "Traffic sources",
  description: "Page views grouped by utm source, medium, campaign, term and content, for the workspace or one funnel, over a date range.",
  access: "read",
  input: z.object({ assessment_id: idInput.optional(), from: dateInput.optional(), to: dateInput.optional() }),
  run: async (ctx, input) => {
    const a = input.assessment_id ? await assessmentInWorkspace(ctx, input.assessment_id) : null;
    const rows = await getUtmBreakdown(appDateRange({ from: input.from, to: input.to }), ctx.workspace.scope, a ? { assessmentId: a.id, floor: a.statsResetAt } : undefined);
    return { funnel: a ? { id: a.id, title: a.title } : "all funnels in this workspace", sources: rows.slice(0, 200), more: Math.max(0, rows.length - 200) };
  },
});

export const STATS_TOOLS: ToolDef[] = [getFunnelStats, getTrafficSources];
