import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { istDateRangeToUtc } from "@/lib/date";
import { ourMicroUsd } from "@/lib/ai/cost-report";
import { apportion, type BilledDay, type UsageRow } from "@/lib/billing/ai-apportion";

/**
 * The books, per tenant: what they paid us, what they cost us, what is left.
 *
 * Deliberately NOT bolted onto the existing tenants list. That page answers "what state
 * is this workspace in" and is read while operating one; this answers "is this business
 * making money", which is read down a column.
 *
 * REVENUE is subscription payments only. Funnel payments are the TENANT's money passing
 * through the tenant's own Razorpay account; it never reaches us.
 *
 * ═══ EXPENSE RECONCILES TO THE INVOICE, AND THAT IS THE WHOLE DESIGN ═══
 *
 * No price is stored anywhere in this path. For each provider-day we hold what the
 * provider BILLED (AiCostDay, pulled by cron:ai-costs) and we split exactly that across
 * tenants by the tokens recorded against them. So:
 *
 *     billed  =  sum of every tenant's share  +  unattributed
 *
 * holds by construction, every day, with no residue parked anywhere to grow quietly
 * into a second set of books. UNATTRIBUTED is reported, never absorbed: it is real
 * money we cannot pin on a tenant, usually platform-level generation or a day whose
 * usage rows went missing, and hiding it inside the tenant column is exactly how a
 * figure starts telling its own story.
 *
 * A day with no AiCostDay row has no billed figure, so it contributes nothing and is
 * counted in `daysUnpriced` for the page to say so. An estimate is never substituted:
 * a number that looks like money and is not is worse than an admitted gap.
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
  payments: number;
  lastPaidAt: Date | null;
  /** This tenant's share of real billed AI spend, in micro-dollars. */
  expenseMicroUsd: number;
  /** Tokens we paid for, in range. */
  tokens: number;
}

export interface AccountsTotals {
  revenueCents: number;
  /** Real money the providers billed for this product, over the range. */
  billedMicroUsd: number;
  /** The part of it pinned on a tenant. */
  attributedMicroUsd: number;
  /** The part that could not be. Reported, never hidden in the rows. */
  unattributedMicroUsd: number;
  profitMicroUsd: number;
  tenants: number;
  /** Days inside the range with AI usage but no billed figure pulled yet. */
  daysUnpriced: number;
  /** Days with a billed figure. */
  daysPriced: number;
}

const centsToMicro = (cents: number): number => cents * 10_000;

/** The UTC date key a usage row belongs to, matching AiCostDay.day. */
const dayKeyOf = (d: Date): string => d.toISOString().slice(0, 10);

export async function getAccounts(range?: Range): Promise<{ rows: AccountRow[]; totals: AccountsTotals }> {
  const createdAt = createdAtFilter(range);

  const [tenants, revenue, lastPaid, usage, costDays] = await Promise.all([
    prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, slug: true, subscription: { select: { plan: true, status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    // `amount` holds CENTS on subscription rows (USD), not the paise it holds for the
    // INR funnel payments - see activateSubscription.
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
    // Our key only: a tenant on their own provider key spends their own money, and
    // counting it would understate profit for the tenants who cost us least.
    prisma.aiUsage.findMany({
      where: { onPlatformKey: true, ...(createdAt ? { createdAt } : {}) },
      select: { tenantId: true, provider: true, inputTokens: true, outputTokens: true, createdAt: true },
    }),
    prisma.aiCostDay.findMany({ where: createdAt ? { day: createdAt } : undefined }),
  ]);

  // ── The split. The arithmetic lives in lib/billing/ai-apportion.ts, pure, so the
  // claim it makes (billed = attributed + unattributed) is pinned by a verify script
  // rather than only visible on this page. Here we do nothing but shape the rows.
  const billedDays: BilledDay[] = costDays.map((c) => ({
    provider: c.provider,
    day: dayKeyOf(c.day),
    ourMicroUsd: ourMicroUsd(c),
  }));
  const usageRows: UsageRow[] = usage.map((u) => ({
    tenantId: u.tenantId,
    provider: u.provider,
    day: dayKeyOf(u.createdAt),
    tokens: u.inputTokens + u.outputTokens,
  }));

  const split = apportion(billedDays, usageRows);

  const tokensByTenant = new Map<string, number>();
  for (const u of usageRows) {
    if (!u.tenantId) continue;
    tokensByTenant.set(u.tenantId, (tokensByTenant.get(u.tenantId) ?? 0) + u.tokens);
  }

  const revById = new Map(revenue.map((r) => [r.tenantId ?? "", r]));
  const lastById = new Map(lastPaid.map((r) => [r.tenantId ?? "", r._max.createdAt]));

  const rows: AccountRow[] = tenants.map((t) => {
    const rev = revById.get(t.id);
    return {
      tenantId: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.subscription?.plan ?? null,
      status: t.subscription?.status ?? null,
      revenueCents: rev?._sum.amount ?? 0,
      payments: rev?._count._all ?? 0,
      lastPaidAt: lastById.get(t.id) ?? null,
      expenseMicroUsd: split.byTenant.get(t.id) ?? 0,
      tokens: tokensByTenant.get(t.id) ?? 0,
    };
  });

  // Biggest earner first: this page is read to find who pays, and ordering by signup
  // date buries them behind everyone who never did.
  rows.sort((a, b) => b.revenueCents - a.revenueCents || b.expenseMicroUsd - a.expenseMicroUsd);

  const revenueCents = rows.reduce((n, r) => n + r.revenueCents, 0);

  return {
    rows,
    totals: {
      revenueCents,
      billedMicroUsd: split.billedMicroUsd,
      attributedMicroUsd: split.attributedMicroUsd,
      unattributedMicroUsd: split.unattributedMicroUsd,
      // Profit is against BILLED, not attributed: unattributed spend is still our money
      // leaving the business, and charging it to nobody does not make it free.
      profitMicroUsd: centsToMicro(revenueCents) - split.billedMicroUsd,
      tenants: rows.length,
      daysUnpriced: split.daysUnpriced,
      daysPriced: split.daysPriced,
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
