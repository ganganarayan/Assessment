import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { istDateRangeToUtc } from "@/lib/date";
import { isPriced } from "@/lib/ai/pricing";

/**
 * The books, per tenant: what they paid us, what they cost us, what is left.
 *
 * Deliberately NOT bolted onto the existing tenants list. That page answers "what state
 * is this workspace in" and is read while operating one; this answers "is this business
 * making money", which is read down a column. Mixing them gives one table that does
 * neither job, and every new money column would make the operational view heavier for
 * people who never wanted it.
 *
 * REVENUE is subscription payments only. Funnel payments (assessment_unlock,
 * product_sale) are the TENANT's money passing through their own Razorpay account - it
 * never reaches us, and counting it here would invent revenue we have not earned.
 *
 * EXPENSE is AI spend on the PLATFORM's key only. A tenant on their own provider key
 * spends their own money; including it would overstate our costs and understate profit
 * for exactly the tenants who cost us least.
 */

type Range = { from?: string; to?: string };

function createdAtFilter(range?: Range): Prisma.DateTimeFilter | undefined {
  const { gte, lte } = istDateRangeToUtc(range?.from, range?.to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

export interface AccountRow {
  tenantId: string;
  name: string;
  slug: string;
  plan: string | null;
  status: string | null;
  /** Subscription revenue, in whole USD cents. */
  revenueCents: number;
  /** Number of subscription payments in range. */
  payments: number;
  /** The most recent subscription payment, for "are they still paying". */
  lastPaidAt: Date | null;
  /** AI spend on our key, in micro-dollars. */
  expenseMicroUsd: number;
  /** Tokens we paid for, in range. */
  tokens: number;
  /**
   * Calls whose MODEL HAS NO RATE in lib/ai/pricing. Their tokens are counted and
   * their cost is zero, so a non-zero number here means the expense column is an
   * UNDERSTATEMENT and the page says so rather than quietly reading as profit.
   */
  unpricedCalls: number;
}

export interface AccountsTotals {
  revenueCents: number;
  expenseMicroUsd: number;
  profitMicroUsd: number;
  unpricedCalls: number;
  tenants: number;
}

/** Micro-dollars from cents, so revenue and expense can be subtracted at one scale. */
const centsToMicro = (cents: number): number => cents * 10_000;

export async function getAccounts(range?: Range): Promise<{ rows: AccountRow[]; totals: AccountsTotals }> {
  const createdAt = createdAtFilter(range);

  const [tenants, revenue, lastPaid, usage, unpriced] = await Promise.all([
    prisma.tenant.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        subscription: { select: { plan: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    // Subscription payments only. `amount` holds CENTS for these rows (USD), not the
    // paise it holds for the INR funnel payments - see activateSubscription.
    prisma.payment.groupBy({
      by: ["tenantId"],
      where: { purpose: "subscription", ...(createdAt ? { createdAt } : {}) },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ["tenantId"],
      where: { purpose: "subscription" },
      _max: { createdAt: true },
    }),
    // Our key only. This is the whole definition of "expense" on this page.
    prisma.aiUsage.groupBy({
      by: ["tenantId"],
      where: { onPlatformKey: true, ...(createdAt ? { createdAt } : {}) },
      _sum: { costMicroUsd: true, inputTokens: true, outputTokens: true },
    }),
    // Every priced-or-not call, counted per model so an unpriced model can be flagged
    // without a second pass over the rows.
    prisma.aiUsage.groupBy({
      by: ["tenantId", "model"],
      where: { onPlatformKey: true, ...(createdAt ? { createdAt } : {}) },
      _count: { _all: true },
    }),
  ]);

  const revById = new Map(revenue.map((r) => [r.tenantId ?? "", r]));
  const lastById = new Map(lastPaid.map((r) => [r.tenantId ?? "", r._max.createdAt]));
  const useById = new Map(usage.map((r) => [r.tenantId ?? "", r]));

  const unpricedById = new Map<string, number>();
  for (const r of unpriced) {
    if (isPriced(r.model)) continue;
    const k = r.tenantId ?? "";
    unpricedById.set(k, (unpricedById.get(k) ?? 0) + r._count._all);
  }

  const rows: AccountRow[] = tenants.map((t) => {
    const rev = revById.get(t.id);
    const use = useById.get(t.id);
    return {
      tenantId: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.subscription?.plan ?? null,
      status: t.subscription?.status ?? null,
      revenueCents: rev?._sum.amount ?? 0,
      payments: rev?._count._all ?? 0,
      lastPaidAt: lastById.get(t.id) ?? null,
      expenseMicroUsd: use?._sum.costMicroUsd ?? 0,
      tokens: (use?._sum.inputTokens ?? 0) + (use?._sum.outputTokens ?? 0),
      unpricedCalls: unpricedById.get(t.id) ?? 0,
    };
  });

  // Biggest earner first: this page is read to find out who pays, and a list ordered
  // by signup date buries them behind everyone who never did.
  rows.sort((a, b) => b.revenueCents - a.revenueCents || b.expenseMicroUsd - a.expenseMicroUsd);

  const revenueCents = rows.reduce((n, r) => n + r.revenueCents, 0);
  const expenseMicroUsd = rows.reduce((n, r) => n + r.expenseMicroUsd, 0);

  return {
    rows,
    totals: {
      revenueCents,
      expenseMicroUsd,
      profitMicroUsd: centsToMicro(revenueCents) - expenseMicroUsd,
      unpricedCalls: rows.reduce((n, r) => n + r.unpricedCalls, 0),
      tenants: rows.length,
    },
  };
}

/** Micro-dollars as "$1.23". Four decimals under a cent, because AI costs live there. */
export function usdFromMicro(micro: number): string {
  const usd = micro / 1_000_000;
  if (usd !== 0 && Math.abs(usd) < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** Cents as "$249.00". */
export function usdFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** One tenant's profit, at the micro scale both sides share. */
export function profitMicro(row: AccountRow): number {
  return centsToMicro(row.revenueCents) - row.expenseMicroUsd;
}
