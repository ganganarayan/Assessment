import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { istDateRangeToUtc } from "@/lib/date";
import { ourMicroUsd } from "@/lib/ai/cost-report";

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

  // ── The split. Per provider-day, because that is the grain the provider bills at.
  const billedByKey = new Map<string, number>();
  for (const c of costDays) {
    billedByKey.set(`${c.provider}|${dayKeyOf(c.day)}`, ourMicroUsd(c));
  }

  // Tokens per provider-day, and within that per tenant, so each day's real money is
  // divided by that day's own shares rather than by a range-wide average.
  const dayTotals = new Map<string, number>();
  const dayTenant = new Map<string, Map<string, number>>();
  const tokensByTenant = new Map<string, number>();

  for (const u of usage) {
    const key = `${u.provider}|${dayKeyOf(u.createdAt)}`;
    const t = u.inputTokens + u.outputTokens;
    dayTotals.set(key, (dayTotals.get(key) ?? 0) + t);
    if (!dayTenant.has(key)) dayTenant.set(key, new Map());
    const per = dayTenant.get(key) as Map<string, number>;
    // Null tenant = platform-level generation. Kept under "" so it lands in
    // unattributed rather than being quietly dropped out of the arithmetic.
    const id = u.tenantId ?? "";
    per.set(id, (per.get(id) ?? 0) + t);
    if (id) tokensByTenant.set(id, (tokensByTenant.get(id) ?? 0) + t);
  }

  const expenseByTenant = new Map<string, number>();
  let billedTotal = 0;
  let attributedTotal = 0;

  for (const [key, billed] of billedByKey) {
    billedTotal += billed;
    const total = dayTotals.get(key) ?? 0;
    if (total <= 0) continue; // billed, but nothing of ours recorded: unattributed.
    for (const [tenantId, tokens] of dayTenant.get(key) ?? []) {
      if (!tenantId) continue; // platform generation stays unattributed, by design.
      const share = Math.round((billed * tokens) / total);
      expenseByTenant.set(tenantId, (expenseByTenant.get(tenantId) ?? 0) + share);
      attributedTotal += share;
    }
  }

  // Days we generated on but have no invoice for yet. Counted, never estimated.
  let daysUnpriced = 0;
  for (const key of dayTotals.keys()) if (!billedByKey.has(key)) daysUnpriced++;

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
      expenseMicroUsd: expenseByTenant.get(t.id) ?? 0,
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
      billedMicroUsd: billedTotal,
      attributedMicroUsd: attributedTotal,
      // By construction, not by a second sum: whatever the invoice holds that no tenant
      // claimed. Rounding residue lands here too, which is where it belongs.
      unattributedMicroUsd: billedTotal - attributedTotal,
      profitMicroUsd: centsToMicro(revenueCents) - billedTotal,
      tenants: rows.length,
      daysUnpriced,
      daysPriced: billedByKey.size,
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
