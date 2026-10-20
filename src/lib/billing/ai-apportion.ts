/**
 * Splitting a real AI invoice across tenants. Pure, so it can be pinned.
 *
 * WHY THIS IS ITS OWN MODULE. The arithmetic used to live inside the Accounts page's
 * database query, where the only way to check it was to look at the page and believe
 * what it said. The claim it makes is the one the whole page rests on:
 *
 *     billed  =  attributed  +  unattributed
 *
 * That has to hold for every provider and every day, or the difference goes somewhere
 * unnoticed and starts growing into a second set of books. A claim that strong should
 * not be provable only by reading a screen, so it lives here with no database, no
 * clock and no imports, and scripts/verify-billing-ledger.ts asserts it. Same move as
 * gate-verdict.ts: one copy of the sums, used by the server and by the check.
 *
 * WHAT IT DOES NOT DO. It never prices anything. `ourMicroUsd` on each billed day is
 * already real money the provider charged (see lib/ai/cost-report.ts); this only
 * decides whose share of it is whose, using token counts we measured. If a day has no
 * invoice it contributes nothing and is counted as unpriced, because filling that gap
 * with an estimate is how the figure stops matching the bill.
 */

/** One day's real spend for one provider, after our key's share is taken. */
export interface BilledDay {
  provider: string;
  /** UTC date, "YYYY-MM-DD". The provider's own day boundary, as an invoice uses. */
  day: string;
  /** Real money, in micro-dollars (USD x 1,000,000). */
  ourMicroUsd: number;
}

/** Tokens we recorded for one tenant, one provider, one day. */
export interface UsageRow {
  /** Null = platform-level generation, which is real spend with no tenant to bill it to. */
  tenantId: string | null;
  provider: string;
  day: string;
  tokens: number;
}

export interface Apportionment {
  /** tenantId -> micro-dollars. Only tenants with usage appear. */
  byTenant: Map<string, number>;
  billedMicroUsd: number;
  attributedMicroUsd: number;
  /**
   * Billed money no tenant claimed: platform generation, days we have an invoice for
   * but no usage rows, and rounding residue. Reported, never folded into a tenant.
   */
  unattributedMicroUsd: number;
  /** Provider-days with usage but no invoice yet. Their cost is missing, not guessed. */
  daysUnpriced: number;
  /** Provider-days with an invoice. */
  daysPriced: number;
}

const keyOf = (provider: string, day: string): string => `${provider}|${day}`;

/**
 * Split each billed day across the tenants that used it that day.
 *
 * Per provider-day, never range-wide: a tenant that generated heavily on an expensive
 * day and lightly on a cheap one must carry the expensive day's cost. Averaging across
 * the range would quietly move money between tenants and still add up, which is the
 * kind of wrong that survives review.
 *
 * Rounding is deliberate. Each share is rounded to a whole micro-dollar, so the shares
 * will not sum exactly to the billed amount. The remainder is NOT redistributed and NOT
 * dropped: `unattributed` is computed as billed minus attributed, so it absorbs the
 * residue by construction and the invariant holds exactly even though the division does
 * not.
 */
export function apportion(billed: readonly BilledDay[], usage: readonly UsageRow[]): Apportionment {
  const dayTotals = new Map<string, number>();
  const dayTenant = new Map<string, Map<string, number>>();

  for (const u of usage) {
    if (u.tokens <= 0) continue;
    const key = keyOf(u.provider, u.day);
    dayTotals.set(key, (dayTotals.get(key) ?? 0) + u.tokens);
    let per = dayTenant.get(key);
    if (!per) {
      per = new Map<string, number>();
      dayTenant.set(key, per);
    }
    // "" is platform generation. Kept in the totals on purpose: it consumed tokens, so
    // it must dilute everyone else's share rather than being deleted from the divisor
    // and silently inflating what the real tenants are charged.
    const id = u.tenantId ?? "";
    per.set(id, (per.get(id) ?? 0) + u.tokens);
  }

  const byTenant = new Map<string, number>();
  let billedMicroUsd = 0;
  let attributedMicroUsd = 0;
  const pricedKeys = new Set<string>();

  for (const b of billed) {
    const key = keyOf(b.provider, b.day);
    pricedKeys.add(key);
    billedMicroUsd += b.ourMicroUsd;

    const total = dayTotals.get(key) ?? 0;
    if (total <= 0) continue; // billed, nothing of ours recorded: all unattributed.

    for (const [tenantId, tokens] of dayTenant.get(key) ?? []) {
      if (!tenantId) continue; // platform generation stays unattributed, by design.
      const share = Math.round((b.ourMicroUsd * tokens) / total);
      byTenant.set(tenantId, (byTenant.get(tenantId) ?? 0) + share);
      attributedMicroUsd += share;
    }
  }

  let daysUnpriced = 0;
  for (const key of dayTotals.keys()) if (!pricedKeys.has(key)) daysUnpriced++;

  return {
    byTenant,
    billedMicroUsd,
    attributedMicroUsd,
    // Subtracted, not summed from a second pass. This is what makes the invariant
    // exact rather than approximately true.
    unattributedMicroUsd: billedMicroUsd - attributedMicroUsd,
    daysUnpriced,
    daysPriced: pricedKeys.size,
  };
}

/**
 * This product's real cost for a day: the bill, times our key's share of the tokens.
 *
 * Lives here rather than beside the fetching code because it is arithmetic, not I/O.
 * It was in lib/ai/cost-report.ts, which is `server-only`, and that wall kept the one
 * sum that decides how much of a shared invoice is ours out of reach of any check that
 * runs in the build. A number that important should not be unverifiable because of
 * where its file sits.
 *
 * Zero total tokens with a non-zero bill means the usage report had nothing to split
 * by, so the whole bill is taken as ours. Understating there would hide real money.
 */
export function ourMicroUsd(row: {
  billedMicroUsd: number;
  scopeTokens: number;
  totalTokens: number;
}): number {
  if (row.totalTokens <= 0) return row.billedMicroUsd;
  if (row.scopeTokens >= row.totalTokens) return row.billedMicroUsd;
  return Math.round((row.billedMicroUsd * row.scopeTokens) / row.totalTokens);
}
