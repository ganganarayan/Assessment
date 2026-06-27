import "server-only";
import { prisma } from "@/lib/db/prisma";
import { normalizeAttribution } from "@/lib/events/payload";
import { istDateRangeToUtc, formatIST } from "@/lib/date";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { getStatsFloor, floorCreatedAt } from "@/lib/stats-floor";
import type { PayloadAttribution } from "@/features/events/types";

/**
 * A Prisma `where` fragment scoping `createdAt` to the selected date range AND
 * the reporting start floor (AppSetting.statsResetAt) — the effective lower bound
 * is the later of the two. No range + no floor => `{}` => ALL records, all time.
 */
async function createdAtScope(range?: { from?: string; to?: string }): Promise<Record<string, unknown>> {
  const { gte, lte } = istDateRangeToUtc(range?.from, range?.to);
  return floorCreatedAt(await getStatsFloor(), gte, lte);
}

/** Aggregate funnel numbers for the Stats page (global, across all assessments). */
export async function getAnalyticsStats(range?: { from?: string; to?: string }) {
  const scope = await createdAtScope(range);

  const [totalViews, uniqueVisitors, optins, completed, vslLoads, paidAgg] = await Promise.all([
    prisma.pageView.count({ where: scope }),
    // distinct visitorId rows; length = unique views (no raw SQL).
    prisma.pageView.findMany({ where: scope, select: { visitorId: true }, distinct: ["visitorId"] }),
    // "Opted in" = submission rows. Equals distinct people for the common config
    // (a required, unique identifier such as email); UNLIMITED-retake or
    // no-identifier assessments may count repeat attempts by the same person.
    prisma.submission.count({ where: scope }),
    prisma.submission.count({ where: { ...scope, status: "COMPLETED" } }),
    prisma.submission.count({ where: { ...scope, resultFetchedAt: { not: null } } }),
    // Captured payments (count + total ₹) in the same window.
    prisma.payment.aggregate({
      where: { ...scope, purpose: "assessment_unlock", status: "captured" },
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
export async function getUtmBreakdown(range?: { from?: string; to?: string }): Promise<UtmBreakdownRow[]> {
  const where = await createdAtScope(range);
  const grouped = await prisma.pageView.groupBy({
    by: ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"],
    where,
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
}

/** Recent page views (one row per visit, no lead data) for the live log. */
export async function listPageViews(opts: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<PageViewLogRow[]> {
  const where = await createdAtScope({ from: opts.from, to: opts.to });
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
  }));
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
  completed: boolean;
  /** Captured payment (paid step comes before VSL load). null = not paid. */
  paidAmount: number | null;
  paidAt: string | null;
  /** Total VSL page loads for this contact (0 = never loaded). */
  vslLoads: number;
  attribution: PayloadAttribution | null;
}

export interface ContactExportRow {
  optInDateIST: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profession: string;
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
}

/** Safety cap so an export can never try to materialize an unbounded result. */
export const EXPORT_CAP = 100_000;

/** ALL contacts matching the date range (no pagination), flattened for export. */
export async function listContactsForExport(range?: {
  from?: string;
  to?: string;
}): Promise<ContactExportRow[]> {
  const where = await createdAtScope(range);
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
    };
  });
}

/** One row per submission (= one opt-in contact) for the Contacts page. */
export async function listContacts(opts: {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
}): Promise<{ rows: ContactRow[]; total: number; page: number; pages: number }> {
  const where = await createdAtScope({ from: opts.from, to: opts.to });

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
        completed: r.status === "COMPLETED",
        paidAmount: p?.amount ?? null,
        paidAt: p?.at ?? null,
        vslLoads: r.resultFetchCount,
        attribution: normalizeAttribution(r.attribution),
      };
    }),
  };
}
