import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { normalizeAttribution } from "@/lib/events/payload";
import { appendVidapulseId } from "@/lib/vidapulse";
import { vidapulseParamForTenant } from "@/lib/events/completion";
import { istDateRangeToUtc, formatIST } from "@/lib/date";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { getStatsFloor, floorCreatedAt } from "@/lib/stats-floor";
import type { PayloadAttribution } from "@/features/events/types";
import { labeledAnswers, labeledAnswersText, type LabeledAnswer } from "@/features/assessment/custom-fields";
import { botSourceFromUserAgent } from "@/lib/bots";

/** The destination URL a contact lands on (targetUrl?t=token&cid=<customerId>),
 *  falling back to the internal result page. Same rule as the completion/CRM builders;
 *  appends the opaque customerId (VidaPulse `cid`) when tracking is on so the operator's
 *  copied/exported link carries the id into VidaPulse for VSL nurture. */
function buildResultUrl(
  targetUrl: string | null,
  slug: string,
  submissionId: string,
  token: string | null,
  customerId: string | null = null,
  vidapulseParam: string | null = null,
): string {
  let url = `${env.NEXT_PUBLIC_APP_URL}/a/${slug}/r/${submissionId}`;
  if (targetUrl && token) {
    try {
      const u = new URL(targetUrl);
      u.searchParams.set("t", token);
      url = u.toString();
    } catch {
      /* malformed targetUrl — keep the internal result-page fallback */
    }
  }
  return appendVidapulseId(url, vidapulseParam, customerId);
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
  // An assessment-scoped view passes its own floor; otherwise each view uses its
  // OWN reporting window — the tenant's for a tenant view, the singleton for the
  // platform/Gita (null-tenant) view.
  const floor = opts && "floor" in opts ? opts.floor ?? null : await getStatsFloor(tenantId);
  const where: Record<string, unknown> = { ...floorCreatedAt(floor, gte, lte), tenantId };
  if (opts?.assessmentId) where.assessmentId = opts.assessmentId;
  return where;
}

/**
 * The same window / tenant / assessment scope, re-keyed for a model whose timestamp
 * column is not `createdAt` — GateEntry uses `passedAt`, FunnelEventCount uses `day`.
 * Keeps one definition of "in scope" instead of three that can drift apart.
 */
function rekeyScope(scope: Record<string, unknown>, field: string): Record<string, unknown> {
  const { createdAt, ...rest } = scope as { createdAt?: unknown };
  return createdAt === undefined ? rest : { ...rest, [field]: createdAt };
}

/** Firings of ONE Meta event in scope: accepted by Meta, and failed. */
export interface EventFireCount {
  eventName: string;
  count: number;
  failed: number;
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

  const [totalViews, uniqueVisitors, optins, completed, vslLoads, paidAgg, disqualified, disqualifiedRepeat, qualified, fired] = await Promise.all([
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
    // Turned away by the qualification gate. FRESH rejections only (`repeat` rows are
    // revisits by someone already rejected) and humans only — so this is people, not
    // the event volume Meta sees. Zero for an ungated assessment.
    prisma.gateDisqualification.count({ where: { ...scope, repeat: false, isBot: false } }),
    // Revisits by someone the gate already rejected: they are short-circuited to the
    // exit page without re-answering, so they are NOT new people. Counted separately
    // because a funnel that reads "0 turned away" while returning visitors pile up is
    // exactly the blind spot that hides a permanent lockout.
    prisma.gateDisqualification.count({ where: { ...scope, repeat: true, isBot: false } }),
    // Passed the gate. The mirror of "turned away": everyone who answered page 1 is
    // one or the other, so views - (qualified + disqualified) is the bounce.
    prisma.gateEntry.count({ where: rekeyScope(scope, "passedAt") }),
    // How many events the funnel actually FIRED at Meta (not how many people) —
    // GateDisqualified, QualifiedCompletion / AssessmentCompleted.
    prisma.funnelEventCount.groupBy({
      by: ["eventName"],
      where: rekeyScope(scope, "day"),
      _sum: { count: true, failed: true },
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
    disqualified,
    disqualifiedRepeat,
    qualified,
    fired: fired
      .map((f) => ({ eventName: f.eventName, count: f._sum.count ?? 0, failed: f._sum.failed ?? 0 }))
      .sort((a, b) => b.count - a.count) satisfies EventFireCount[],
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
  /** Client IP + User-Agent (admin-only) — for triaging untagged/blank traffic. */
  ip: string | null;
  userAgent: string | null;
  /** Geo (Cloudflare) + device (parsed UA) enrichment. */
  country: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  timezone: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  /**
   * What the page-1 gate did with this visitor, resolved at read time:
   *   "qualified"           — passed the gate,
   *   "disqualified"        — answered a disqualifying option,
   *   "disqualified_repeat" — was already rejected and sent straight to the exit page,
   *   null                  — never answered page 1 (landed and left).
   * Per VISITOR, not per view: a view is stamped with the outcome that visitor
   * reached on this assessment, which is what makes "450 views, 1 opt-in" readable.
   */
  gate: "qualified" | "disqualified" | "disqualified_repeat" | null;
}

/**
 * Resolve the page-1 gate outcome for the visitors behind a page of log rows, keyed
 * "<assessmentId>|<visitorId>" so one visitor's outcome never leaks across funnels.
 *
 * Two grouped reads for the whole page (no N+1). Precedence: a fresh rejection beats
 * a repeat, and either beats a pass — someone who passed once and was rejected later
 * is a rejected visitor.
 */
async function gateOutcomes(
  rows: { assessmentId: string; visitorId: string }[],
): Promise<Map<string, "qualified" | "disqualified" | "disqualified_repeat">> {
  const out = new Map<string, "qualified" | "disqualified" | "disqualified_repeat">();
  const visitorIds = [...new Set(rows.map((r) => r.visitorId))];
  if (visitorIds.length === 0) return out;
  const assessmentIds = [...new Set(rows.map((r) => r.assessmentId))];
  const scope = { assessmentId: { in: assessmentIds }, visitorId: { in: visitorIds } };

  const [passes, rejections] = await Promise.all([
    prisma.gateEntry.findMany({ where: scope, select: { assessmentId: true, visitorId: true } }),
    prisma.gateDisqualification.findMany({ where: scope, select: { assessmentId: true, visitorId: true, repeat: true } }),
  ]);
  for (const p of passes) out.set(`${p.assessmentId}|${p.visitorId}`, "qualified");
  for (const r of rejections) {
    const key = `${r.assessmentId}|${r.visitorId}`;
    if (r.repeat && out.get(key) === "disqualified") continue; // fresh wins
    out.set(key, r.repeat ? "disqualified_repeat" : "disqualified");
  }
  return out;
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
      assessmentId: true,
      visitorId: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmTerm: true,
      utmContent: true,
      fbclid: true,
      gclid: true,
      isBot: true,
      ip: true,
      userAgent: true,
      country: true,
      city: true,
      region: true,
      postalCode: true,
      timezone: true,
      deviceType: true,
      browser: true,
      os: true,
    },
  });

  const gate = await gateOutcomes(rows);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    gate: gate.get(`${r.assessmentId}|${r.visitorId}`) ?? null,
    source: r.utmSource,
    medium: r.utmMedium,
    campaign: r.utmCampaign,
    term: r.utmTerm,
    content: r.utmContent,
    fbclid: r.fbclid,
    gclid: r.gclid,
    isBot: r.isBot,
    ip: r.ip,
    userAgent: r.userAgent,
    country: r.country,
    city: r.city,
    region: r.region,
    postalCode: r.postalCode,
    timezone: r.timezone,
    deviceType: r.deviceType,
    browser: r.browser,
    os: r.os,
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
  /** Geo (Cloudflare) + device (parsed UA) captured at opt-in. */
  country: string | null;
  city: string | null;
  region: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
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
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  timezone: string | null;
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
      country: true,
      city: true,
      region: true,
      postalCode: true,
      timezone: true,
      deviceType: true,
      browser: true,
      os: true,
      optinAnswers: true,
      preResultAnswers: true,
      qualificationAnswers: true,
      assessment: { select: { slug: true, targetUrl: true, optinFields: true, preResultFields: true, qualification: true } },
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
          qualification: r.assessment?.qualification,
          qualificationAnswers: r.qualificationAnswers,
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
      device_type: r.deviceType ?? null,
      browser: r.browser ?? null,
      os: r.os ?? null,
      country: r.country ?? null,
      city: r.city ?? null,
      region: r.region ?? null,
      postal_code: r.postalCode ?? null,
      timezone: r.timezone ?? null,
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
      country: true,
      city: true,
      region: true,
      postalCode: true,
      timezone: true,
      deviceType: true,
      browser: true,
      os: true,
      optinAnswers: true,
      preResultAnswers: true,
      qualificationAnswers: true,
      assessment: { select: { slug: true, targetUrl: true, tenantId: true, optinFields: true, preResultFields: true, qualification: true } },
    },
  });

  const paid = await getPaidBySubmission(rows.map((r) => r.id));

  // VidaPulse `cid` param per distinct tenant (a platform page may span tenants), so
  // each contact's Result URL carries the customer id alongside the token.
  const paramByTenant = new Map<string | null, string | null>();
  for (const tid of new Set(rows.map((r) => r.assessment?.tenantId ?? null))) {
    paramByTenant.set(tid, await vidapulseParamForTenant(tid));
  }

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
            ? buildResultUrl(r.assessment?.targetUrl ?? null, r.assessment?.slug ?? "", r.id, r.resultToken, r.customerId, paramByTenant.get(r.assessment?.tenantId ?? null) ?? null)
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
        country: r.country,
        city: r.city,
        region: r.region,
        deviceType: r.deviceType,
        browser: r.browser,
        os: r.os,
        customAnswers: labeledAnswers({
          optinFields: r.assessment?.optinFields,
          optinAnswers: r.optinAnswers,
          preResultFields: r.assessment?.preResultFields,
          preResultAnswers: r.preResultAnswers,
          qualification: r.assessment?.qualification,
          qualificationAnswers: r.qualificationAnswers,
        }),
      };
    }),
  };
}
