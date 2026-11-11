import "server-only";
import { prisma } from "@/lib/db/prisma";
import { istMonthStart } from "@/lib/date";
import { costMicroUsd, isPriced } from "@/lib/ai/pricing";

/**
 * AI usage per tenant, cumulative: one row per workspace, never one row per call.
 *
 * Everything is read from ai_usage, which every AI call in the app writes after it
 * returns (statements, builder generation, the lifecycle engine). Tokens are the
 * provider's own counts and exact. Money is an ESTIMATE at list price
 * (lib/ai/pricing MODEL_RATES), except where a row already carries a cost (Gemini).
 * The billed, invoice-matching figure lives on Revenue once the daily cost pull runs;
 * this screen answers "who is using how much, and roughly what is it costing", today.
 *
 * Calls on a tenant's OWN provider key are counted but kept apart: that spend is
 * theirs, not ours.
 */

export interface AiUsageRow {
  tenantId: string | null;
  name: string;
  slug: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD x 1e6 on the platform key: our money. */
  platformMicroUsd: number;
  /** Estimated USD x 1e6 on the tenant's own key: their money. */
  ownKeyMicroUsd: number;
  monthCalls: number;
  monthPlatformMicroUsd: number;
  /** Calls whose model has no rate, so their cost is missing rather than guessed. */
  unpricedCalls: number;
  models: string[];
  lastAt: Date | null;
}

export interface AiUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  platformMicroUsd: number;
  ownKeyMicroUsd: number;
  monthCalls: number;
  monthPlatformMicroUsd: number;
  unpricedCalls: number;
}

type Group = {
  tenantId: string | null;
  model: string;
  onPlatformKey: boolean;
  _count: { _all: number };
  _sum: { inputTokens: number | null; outputTokens: number | null; costMicroUsd: number | null };
  _max: { createdAt: Date | null };
};

/** A group's money: the stored cost where one exists, else tokens at list price. */
function groupMicro(g: Group): number {
  const stored = g._sum.costMicroUsd ?? 0;
  if (stored > 0) return stored;
  return costMicroUsd(g.model, g._sum.inputTokens ?? 0, g._sum.outputTokens ?? 0);
}

export async function getAiUsageByTenant(): Promise<{ rows: AiUsageRow[]; totals: AiUsageTotals; since: Date | null }> {
  const by = ["tenantId", "model", "onPlatformKey"] as const;
  const agg = {
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true, costMicroUsd: true },
    _max: { createdAt: true },
  } as const;
  const [all, month, first] = await Promise.all([
    prisma.aiUsage.groupBy({ by: [...by], ...agg }) as unknown as Promise<Group[]>,
    prisma.aiUsage.groupBy({ by: [...by], where: { createdAt: { gte: istMonthStart() } }, ...agg }) as unknown as Promise<Group[]>,
    prisma.aiUsage.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  const ids = [...new Set(all.map((g) => g.tenantId).filter((id): id is string => !!id))];
  const tenants = await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } });
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const rows = new Map<string, AiUsageRow>();
  const rowFor = (tenantId: string | null): AiUsageRow => {
    const key = tenantId ?? "(none)";
    let r = rows.get(key);
    if (!r) {
      const t = tenantId ? tenantById.get(tenantId) : undefined;
      r = {
        tenantId,
        name: t?.name ?? (tenantId ? "(deleted workspace)" : "Platform (no workspace)"),
        slug: t?.slug ?? null,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        platformMicroUsd: 0,
        ownKeyMicroUsd: 0,
        monthCalls: 0,
        monthPlatformMicroUsd: 0,
        unpricedCalls: 0,
        models: [],
        lastAt: null,
      };
      rows.set(key, r);
    }
    return r;
  };

  for (const g of all) {
    const r = rowFor(g.tenantId);
    r.calls += g._count._all;
    r.inputTokens += g._sum.inputTokens ?? 0;
    r.outputTokens += g._sum.outputTokens ?? 0;
    if (g.onPlatformKey) r.platformMicroUsd += groupMicro(g);
    else r.ownKeyMicroUsd += groupMicro(g);
    if ((g._sum.costMicroUsd ?? 0) === 0 && !isPriced(g.model)) r.unpricedCalls += g._count._all;
    if (!r.models.includes(g.model)) r.models.push(g.model);
    if (g._max.createdAt && (!r.lastAt || g._max.createdAt > r.lastAt)) r.lastAt = g._max.createdAt;
  }
  for (const g of month) {
    const r = rowFor(g.tenantId);
    r.monthCalls += g._count._all;
    if (g.onPlatformKey) r.monthPlatformMicroUsd += groupMicro(g);
  }

  const list = [...rows.values()].sort((a, b) => b.platformMicroUsd + b.ownKeyMicroUsd - (a.platformMicroUsd + a.ownKeyMicroUsd));
  const totals = list.reduce<AiUsageTotals>(
    (t, r) => ({
      calls: t.calls + r.calls,
      inputTokens: t.inputTokens + r.inputTokens,
      outputTokens: t.outputTokens + r.outputTokens,
      platformMicroUsd: t.platformMicroUsd + r.platformMicroUsd,
      ownKeyMicroUsd: t.ownKeyMicroUsd + r.ownKeyMicroUsd,
      monthCalls: t.monthCalls + r.monthCalls,
      monthPlatformMicroUsd: t.monthPlatformMicroUsd + r.monthPlatformMicroUsd,
      unpricedCalls: t.unpricedCalls + r.unpricedCalls,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, platformMicroUsd: 0, ownKeyMicroUsd: 0, monthCalls: 0, monthPlatformMicroUsd: 0, unpricedCalls: 0 },
  );
  return { rows: list, totals, since: first?.createdAt ?? null };
}
