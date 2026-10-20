import { requireSuperAdmin } from "@/lib/auth/guards";
import { DateRangeFilter } from "@/features/admin/components/date-range-filter";
import { formatISTDate } from "@/lib/date";
import {
  getAccounts,
  profitMicro,
  usdFromCents,
  usdFromMicro,
} from "@/features/admin/data/accounts";

export const dynamic = "force-dynamic";

/**
 * Accounts: revenue, cost and profit per tenant, and for the platform as a whole.
 *
 * A SEPARATE PAGE FROM THE TENANTS LIST, on purpose. That list answers "what state is
 * this workspace in" and is read while operating one. This answers "is this business
 * making money", which is read down a column. One table doing both does neither, and
 * every money column added there would weigh on people who came for the other job.
 *
 * What the two numbers mean is narrower than it looks, and the page says so rather
 * than leaving it to be assumed:
 *
 *   REVENUE is subscription payments. Funnel payments belong to the tenant and run
 *   through the tenant's own Razorpay account; they never reach us.
 *
 *   EXPENSE is AI run on the PLATFORM's key. A tenant on their own key spends their
 *   own money, and counting it would understate profit for the cheapest tenants.
 */
export default async function PlatformAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const { rows, totals } = await getAccounts({ from: sp.from, to: sp.to });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          What each workspace has paid us, what it has cost us in AI, and the difference.
          Subscription payments only: money a tenant collects through their own funnel is
          theirs and never passes through us.
        </p>
      </div>

      <DateRangeFilter basePath="/platform/accounts" />

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Revenue" value={usdFromCents(totals.revenueCents)} tone="good" />
        <Figure label="AI expense" value={usdFromMicro(totals.expenseMicroUsd)} />
        <Figure
          label="Profit"
          value={usdFromMicro(totals.profitMicroUsd)}
          tone={totals.profitMicroUsd >= 0 ? "good" : "bad"}
        />
      </div>

      {/* 🟡 Said out loud rather than left in the arithmetic. A model with no rate in
          lib/ai/pricing records its tokens and a cost of zero, so the expense column is
          an understatement and the profit above it is flattering. Better to print that
          than to let a confident number be believed. */}
      {totals.unpricedCalls > 0 ? (
        <p className="rounded-lg border border-yellow-600/40 bg-yellow-600/10 px-4 py-3 text-sm">
          {totals.unpricedCalls} AI call{totals.unpricedCalls === 1 ? "" : "s"} ran on a model with
          no rate set, so their tokens are counted but their cost is not. Expense is therefore
          lower than the truth, and profit higher. Add the rate in lib/ai/pricing.ts.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Workspace</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Payments</th>
              <th className="px-3 py-2">Last paid</th>
              <th className="px-3 py-2 text-right">AI expense</th>
              <th className="px-3 py-2 text-right">Tokens</th>
              <th className="px-3 py-2 text-right">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const p = profitMicro(r);
              return (
                <tr key={r.tenantId}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.name}</span>{" "}
                    <span className="text-xs text-[var(--muted-foreground)]">{r.slug}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                    {r.plan ? `${r.plan}${r.status ? ` · ${r.status.toLowerCase()}` : ""}` : "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{usdFromCents(r.revenueCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.payments || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {r.lastPaidAt ? formatISTDate(r.lastPaidAt) : "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {usdFromMicro(r.expenseMicroUsd)}
                    {r.unpricedCalls > 0 ? (
                      <span
                        title={`${r.unpricedCalls} call(s) on a model with no rate set`}
                        className="ml-1 text-yellow-600"
                      >
                        *
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--muted-foreground)]">
                    {r.tokens ? r.tokens.toLocaleString("en-IN") : "-"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium tabular-nums ${
                      p < 0 ? "text-red-600" : ""
                    }`}
                  >
                    {usdFromMicro(p)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 bg-[var(--muted)] font-semibold">
            <tr>
              <td className="px-3 py-2" colSpan={2}>
                {totals.tenants} workspace{totals.tenants === 1 ? "" : "s"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{usdFromCents(totals.revenueCents)}</td>
              <td className="px-3 py-2" colSpan={2} />
              <td className="px-3 py-2 text-right tabular-nums">{usdFromMicro(totals.expenseMicroUsd)}</td>
              <td className="px-3 py-2" />
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  totals.profitMicroUsd < 0 ? "text-red-600" : ""
                }`}
              >
                {usdFromMicro(totals.profitMicroUsd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          tone === "good" ? "text-green-600" : tone === "bad" ? "text-red-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
