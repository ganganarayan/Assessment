import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { normalizeAttribution } from "@/lib/events/payload";
import { istDateRangeToUtc, formatIST } from "@/lib/date";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { getStatsFloor, floorCreatedAt } from "@/lib/stats-floor";
import type { PayloadAttribution } from "@/features/events/types";
import { labeledAnswers, labeledAnswersText, type LabeledAnswer } from "@/features/assessment/custom-fields";
import { botSourceFromUserAgent } from "@/lib/bots";

/** The destination URL a contact lands on (targetUrl?t=token), falling back to the
 *  internal result page. Same rule as the completion/CRM builders. */
function buildResultUrl(targetUrl: string | null, slug: string, submissionId: string, token: string | null): string {
  if (targetUrl && token) {
    try {
      const u = new URL(targetUrl);
      u.searchParams.set("t", token);
      return u.toString();
    } catch {
      /* malformed targetUrl — fall back to the internal result page */
    }
  }
  return `${env.NEXT_PUBLIC_APP_URL}/a/${slug}/r/${submissionId}`;
}

/**
 * A Prisma `where` fragment scoping `createdAt` to the selected date range AND
 * the reporting start floor (AppSetting.statsResetAt) — the effective lower bound
 * is the later of the two. No range + no floor => `{}` => ALL records, all time.
 */
/**
 * `where` fragment scoping createdAt to the range + reporting floor AND to a tenant.
 * The stats-floor "reset to 0" is a platform/Gita setting, so it is applied ONLY to
 * the platform view (tenantId null) — a tenant sees all of its own records. The
 * returned fragment always pins `tenantId`, so every report is tenant-isolated.
 */
/** Optional per-assessment scoping. When assessmentId is set, `floor` is that
 *  assessment's own reporting window (its statsResetAt) — passed explicitly so the
 *  global stats-floor is not applied on top. */
export interface AssessmentScope {
  assessmentId?: string | null;
  floor?: Date | null;
}

async function createdAtScope(
  range?: { from?: string; to?: string },
  tenantId: string | null = null,
  opts?: AssessmentScope,
): Promise<Record<string, unknown>> {
  const { gte, lte } = istDateRangeToUtc(range?.from, range?.to);
  // An assessment-scoped view passes its own floor; otherwise the platform floor
  // applies to the global (null-tenant) view and none to a tenant view.
  const floor = opts && "floor" in opts ? opts.floor ?? null : tenantId ? null : await getStatsFloor();
  const where: Record<string, unknown> = { ...floorCreatedAt(floor, gte, lte), tenantId };
  if (opts?.assessmentId) where.assessmentId = opts.assessmentId;
  return where;
}

/** Aggregate funnel numbers for the Stats page. Pass tenantId to scope to a
 *  workspace, and opts.assessmentId to scope to a single assessment. */
export async function getAnalyticsStats(
  range?: { from?: string; to?: string },
  tenantId: string | null = null,
  opts?: AssessmentScope,
) {
  const scope = await createdAtScope(range, tenantId, opts);
  // Page-view metrics count real humans only — bot/crawler hits (e.g. Meta's
  // ad-review agent) are recorded but never counted as traffic.
  const humanScope = { ...scope, isBot: false };

  const [totalViews, uniqueVisitors, optins, completed, vslLoads, paidAgg] = await Promise.all([
    prisma.pageView.count({ where: humanScope }),
    // distinct visitorId rows; length = unique views (no raw SQL).
    prisma.pageView.findMany({ where: humanScope, select: { visitorId: true }, distinct: ["visitorId"] }),
    // "Opted in" = submission rows. Equals distinct people for the common config
    // (a required, unique identifier such as email); UNLIMITED-retake or
    // no-identifier assessments may count repeat attempts by the same person.
    prisma.submission.count({ where: scope }),
    prisma.submission.count({ where: { ...scope, status: "COMPLETED" } }),
    prisma.submission.count({ where: { ...scope, resultFetchedAt: { not: null } } }),
    // Captured ASSESSMENT payments (count + total ₹) in the same window. Require a
    // submissionId so unrelated Razorpay payments (other links on the same account,
    // with no app submissionId) are never counted as assessment sales.
    prisma.payment.aggregate({
      where: { ...scope, purpose: "assessment_unlock", status: "captured", submissionId: { not: null } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);
  return {
    totalViews,
    uniqueViews: uniqueVisitors.length,
    optins,
    completed,
    vslLoads,
    paidCount: paidAgg._count._all,
    paidAmount: (paidAgg._sum.amount ?? 0) / 100, // paise -> rupees
  };
}

export interface UtmBreakdownRow {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  views: number;
}

/** Page-view counts grouped by UTM combination (traffic source), in range. */
export async function getUtmBreakdown(range?: { from?: string; to?: string }, tenantId: string | null = null, opts?: AssessmentScope): Promise<UtmBreakdownRow[]> {
  const where = await createdAtScope(range, tenantId, opts);
  const grouped = await prisma.pageView.groupBy({
    by: ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"],
    // Traffic source is a human-only view; bot hits are excluded.
    where: { ...where, isBot: false },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 200,
  });
  return grouped.map((g) => ({
    source: g.utmSource,
    medium: g.utmMedium,
    campaign: g.utmCampaign,
    term: g.utmTerm,
    content: g.utmContent,
    views: g._count.id,
  }));
}

export interface PageViewLogRow {
  id: string;
  createdAt: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  fbclid: string | null;
  gclid: string | null;
  /** Automated client (bot/crawler/renderer) — shown labeled, excluded from stats. */
  isBot: boolean;
}

/** Recent page views (one row per visit, no lead data) for the live log. Bot hits
 *  are EXCLUDED by default (the live log shows one collapsed bot row instead — see
 *  getBotViewSummary); pass includeBots for the raw export where every hit is a row. */
export async function listPageViews(opts: {
  from?: string;
  to?: string;
  limit?: number;
  tenantId?: string | null;
  assessmentId?: string | null;
  floor?: Date | null;
  includeBots?: boolean;
}): Promise<PageViewLogRow[]> {
  const scope = await createdAtScope({ from: opts.from, to: opts.to }, opts.tenantId ?? null, {
    assessmentId: opts.assessmentId,
    ...("floor" in opts ? { floor: opts.floor } : {}),
  });
  const where = opts.includeBots ? scope : { ...scope, isBot: false };
  const rows = await prisma.pageView.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
    select: {
      id: true,
      createdAt: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmTerm: true,
      utmContent: true,
      fbclid: true,
      gclid: true,
      isBot: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    source: r.utmSource,
    medium: r.utmMedium,
    campaign: r.utmCampaign,
    term: r.utmTerm,
    content: r.utmContent,
    fbclid: r.fbclid,
    gclid: r.gclid,
    isBot: r.isBot,
  }));
}

/** One clubbed bot row: a source (e.g. "Meta ad-review") with its running hit
 *  count and first/last-seen span. Derived at read time from the stored UA. */
export interface BotSourceRow {
  source: string;
  count: number;
  /** Earliest hit from this source (ISO). */
  firstAt: string;
  /** Most recent hit from this source (ISO). */
  lastAt: string;
}

/** Read cap — bot volume is tiny; guards only against a pathological flood. */
const BOT_ROWS_CAP = 5000;

/** All bot page views in scope, CLUBBED BY SOURCE into one row each (running count
 *  + first/last seen), sorted by count desc. Empty when there are none. These are
 *  rendered BELOW the human page-view rows so real traffic reads first. */
export async function getBotSourceRows(opts: {
  from?: string;
  to?: string;
  tenantId?: string | null;
  assessmentId?: string | null;
  floor?: Date | null;
}): Promise<BotSourceRow[]> {
  const scope = await createdAtScope({ from: opts.from, to: opts.to }, opts.tenantId ?? null, {
    assessmentId: opts.assessmentId,
    ...("floor" in opts ? { floor: opts.floor } : {}),
  });
  const rows = await prisma.pageView.findMany({
    where: { ...scope, isBot: true },
    select: { userAgent: true, createdAt: true },
    take: BOT_ROWS_CAP,
  });
  if (rows.length === 0) return [];

  // Club by friendly source label, tracking count + the span of hit times.
  const bySource = new Map<string, { count: number; first: Date; last: Date }>();
  for (const r of rows) {
    const label = botSourceFromUserAgent(r.userAgent);
    const cur = bySource.get(label);
    if (!cur) {
      bySource.set(label, { count: 1, first: r.createdAt, last: r.createdAt });
    } else {
      cur.count += 1;
      if (r.createdAt < cur.first) cur.first = r.createdAt;
      if (r.createdAt > cur.last) cur.last = r.createdAt;
    }
  }
  return [...bySource.entries()]
    .map(([source, v]) => ({
      source,
      count: v.count,
      firstAt: v.first.toISOString(),
      lastAt: v.last.toISOString(),
    }))
    .sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : -1));
}

export interface ContactRow {
  id: string;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  profession: string | null;
  /** Stable 8-char id (also sent to the CRM as contact.customer_id). */
  customerId: string | null;
  /** 16-char result token — the t= value in the post-assessment URL. */
  resultToken: string | null;
  /** Full destination URL the contact lands on (targetUrl?t=token). */
  resultUrl: string | null;
  completed: boolean;
  /** Captured payment (paid step comes before VSL load). null = not paid. */
  paidAmount: number | null;
  paidAt: string | null;
  /** Total VSL page loads for this contact (0 = never loaded). */
  vslLoads: number;
  attribution: PayloadAttribution | null;
  /** Meta CAPI match signals captured at opt-in (null for pre-capture contacts). */
  clientIp: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbclidTimestamp: number | null;
  /** Custom opt-in + pre-results field answers (label + value), in field order. */
  customAnswers: LabeledAnswer[];
}

export interface ContactExportRow {
  optInDateIST: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profession: string;
  customDetails: string;
  customerId: string;
  resultToken: string;
  completed: boolean;
  paidAmount: number | null;
  paidAtIST: string;
  vslLoads: number;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbclid: string | null;
  gclid: string | null;
  fbclid_timestamp: number | null;
  fbp: string | null;
  client_ip: string | null;
  user_agent: string | null;
}

/** Safety cap so an export can never try to materialize an unbounded result. */
export const EXPORT_CAP = 100_000;

/** ALL contacts matching the date range (no pagination), flattened for export. */
export async function listContactsForExport(range?: {
  from?: string;
  to?: string;
}, tenantId: string | null = null): Promise<ContactExportRow[]> {
  const where = await createdAtScope(range, tenantId);
  const rows = await prisma.submission.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_CAP,
    select: {
      id: true,
      createdAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      customerId: true,
      resultToken: true,
      status: true,
      resultFetchCount: true,
      attribution: true,
      clientIp: true,
      userAgent: true,
      fbp: true,
      fbclidTimestamp: true,
      optinAnswers: true,
      preResultAnswers: true,
      assessment: { select: { slug: true, targetUrl: true, optinFields: true, preResultFields: true } },
    },
  });
  const paid = await getPaidBySubmission(rows.map((r) => r.id));
  return rows.map((r) => {
    const a = normalizeAttribution(r.attribution);
    const p = paid.get(r.id);
    return {
      optInDateIST: formatIST(r.createdAt),
      firstName: r.leadFirstName ?? "",
      lastName: r.leadLastName ?? "",
      email: r.leadEmail ?? "",
      phone: r.leadMobile ?? "",
      profession: r.leadProfession ?? "",
      customDetails: labeledAnswersText(
        labeledAnswers({
          optinFields: r.assessment?.optinFields,
          optinAnswers: r.optinAnswers,
          preResultFields: r.assessment?.preResultFields,
          preResultAnswers: r.preResultAnswers,
        }),
      ),
      customerId: r.customerId ?? "",
      resultToken: r.resultToken ?? "",
      completed: r.status === "COMPLETED",
      paidAmount: p?.amount ?? null,
      paidAtIST: p?.at ? formatIST(new Date(p.at)) : "",
      vslLoads: r.resultFetchCount,
      utm_source: a?.utm_source ?? null,
      utm_medium: a?.utm_medium ?? null,
      utm_campaign: a?.utm_campaign ?? null,
      utm_term: a?.utm_term ?? null,
      utm_content: a?.utm_content ?? null,
      fbclid: a?.fbclid ?? null,
      gclid: a?.gclid ?? null,
      fbclid_timestamp: r.fbclidTimestamp ?? null,
      fbp: r.fbp ?? null,
      client_ip: r.clientIp ?? null,
      user_agent: r.userAgent ?? null,
    };
  });
}

/** One row per submission (= one opt-in contact) for the Contacts page. */
export async function listContacts(opts: {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  /** Scope to a single tenant's leads (the workspace); null = platform/Gita. */
  tenantId?: string | null;
  /** Scope to a single assessment (with its own reporting floor). */
  assessmentId?: string | null;
  floor?: Date | null;
}): Promise<{ rows: ContactRow[]; total: number; page: number; pages: number }> {
  // createdAtScope pins tenantId (and skips the Gita floor for tenants).
  const where = await createdAtScope({ from: opts.from, to: opts.to }, opts.tenantId ?? null, {
    assessmentId: opts.assessmentId,
    ...("floor" in opts ? { floor: opts.floor } : {}),
  });

  // Count first so an out-of-range ?page= is clamped to the last real page
  // (avoids a nonsensical "Page 9999 of 3" pager and a wasted skip past the end).
  const total = await prisma.submission.count({ where });
  const pages = Math.max(1, Math.ceil(total / opts.pageSize));
  const page = Math.min(Math.max(1, opts.page), pages);

  const rows = await prisma.submission.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * opts.pageSize,
    take: opts.pageSize,
    select: {
      id: true,
      createdAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      customerId: true,
      resultToken: true,
      status: true,
      resultFetchCount: true,
      attribution: true,
      clientIp: true,
      userAgent: true,
      fbp: true,
      fbclidTimestamp: true,
      optinAnswers: true,
      preResultAnswers: true,
      assessment: { select: { slug: true, targetUrl: true, optinFields: true, preResultFields: true } },
    },
  });

  const paid = await getPaidBySubmission(rows.map((r) => r.id));

  return {
    total,
    page,
    pages,
    rows: rows.map((r) => {
      const p = paid.get(r.id);
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        firstName: r.leadFirstName,
        lastName: r.leadLastName,
        email: r.leadEmail,
        mobile: r.leadMobile,
        profession: r.leadProfession,
        customerId: r.customerId,
        resultToken: r.resultToken,
        // A result link exists ONLY for a completed submission; a not-taken/started
        // row stays blank (no misleading link).
        resultUrl:
          r.status === "COMPLETED"
            ? buildResultUrl(r.assessment?.targetUrl ?? null, r.assessment?.slug ?? "", r.id, r.resultToken)
            : null,
        completed: r.status === "COMPLETED",
        paidAmount: p?.amount ?? null,
        paidAt: p?.at ?? null,
        vslLoads: r.resultFetchCount,
        attribution: normalizeAttribution(r.attribution),
        clientIp: r.clientIp,
        userAgent: r.userAgent,
        fbp: r.fbp,
        fbclidTimestamp: r.fbclidTimestamp,
        customAnswers: labeledAnswers({
          optinFields: r.assessment?.optinFields,
          optinAnswers: r.optinAnswers,
          preResultFields: r.assessment?.preResultFields,
          preResultAnswers: r.preResultAnswers,
        }),
      };
    }),
  };
}
