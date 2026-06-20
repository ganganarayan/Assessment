import "server-only";
import { prisma } from "@/lib/db/prisma";
import { normalizeAttribution } from "@/lib/events/payload";
import { istDateRangeToUtc } from "@/lib/date";
import type { PayloadAttribution } from "@/features/events/types";

/** The analytics baseline: counts include only records at/after this instant. */
async function statsSince(): Promise<Date | null> {
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { statsResetAt: true },
  });
  return s?.statsResetAt ?? null;
}

const laterOf = (a: Date | null, b: Date | null): Date | null =>
  !a ? b : !b ? a : a.getTime() >= b.getTime() ? a : b;

/**
 * A Prisma `where` fragment scoping `createdAt`. The reset baseline is a
 * persistent floor; the picked date range narrows within it (lower bound = the
 * later of the two). Returns `{}` when neither is set.
 */
function createdAtScope(
  since: Date | null,
  range?: { from?: string; to?: string },
): Record<string, unknown> {
  const { gte, lte } = istDateRangeToUtc(range?.from, range?.to);
  const lower = laterOf(since, gte);
  if (!lower && !lte) return {};
  return { createdAt: { ...(lower ? { gte: lower } : {}), ...(lte ? { lte } : {}) } };
}

/** Aggregate funnel numbers for the Stats page (global, across all assessments). */
export async function getAnalyticsStats(range?: { from?: string; to?: string }) {
  const since = await statsSince();
  const createdSince = createdAtScope(since, range);

  const [totalViews, uniqueVisitors, optins, completed, vslLoads] = await Promise.all([
    prisma.pageView.count({ where: createdSince }),
    // distinct visitorId rows; length = unique views (no raw SQL, honours the baseline).
    prisma.pageView.findMany({ where: createdSince, select: { visitorId: true }, distinct: ["visitorId"] }),
    // "Opted in" = submission rows. Equals distinct people for the common config
    // (a required, unique identifier such as email); UNLIMITED-retake or
    // no-identifier assessments may count repeat attempts by the same person.
    prisma.submission.count({ where: createdSince }),
    prisma.submission.count({ where: { ...createdSince, status: "COMPLETED" } }),
    prisma.submission.count({ where: { ...createdSince, resultFetchedAt: { not: null } } }),
  ]);
  return {
    totalViews,
    uniqueViews: uniqueVisitors.length,
    optins,
    completed,
    vslLoads,
    since,
  };
}

export interface ContactRow {
  id: string;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  completed: boolean;
  vslLoaded: boolean;
  attribution: PayloadAttribution | null;
}

/** One row per submission (= one opt-in contact) for the Contacts page. */
export async function listContacts(opts: {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
}): Promise<{ rows: ContactRow[]; total: number; page: number; pages: number }> {
  const since = await statsSince();
  const where = createdAtScope(since, { from: opts.from, to: opts.to });

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
      status: true,
      resultFetchedAt: true,
      attribution: true,
    },
  });

  return {
    total,
    page,
    pages,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      firstName: r.leadFirstName,
      lastName: r.leadLastName,
      email: r.leadEmail,
      mobile: r.leadMobile,
      completed: r.status === "COMPLETED",
      vslLoaded: r.resultFetchedAt !== null,
      attribution: normalizeAttribution(r.attribution),
    })),
  };
}
