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
 * making money", which is read down a column.
 *
 * The page's job is that the figures RECONCILE. Billed is what the providers invoiced,
 * taken from their own cost reports rather than from a price list, so it is the same
 * number as the bill. Every tenant figure is a share of it. Whatever no tenant claims
 * is printed as unattributed instead of being folded into the rows, so there is never a
 * difference loose in the system to compound into a second set of books.
 *
 * What it does NOT do: estimate. A day with no billed figure contributes nothing and
 * the page says how many such days there were. A number that looks like money and is
 * not is worse than an admitted gap, because it gets believed.
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
        <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          What each workspace has paid us, what it has cost us in AI, and the difference.
          Subscription payments only: money a tenant collects through their own funnel is
          theirs and never passes through us.
        </p>
      </div>

      <DateRangeFilter basePath="/platform/accounts" />

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Revenue" value={usdFromCents(totals.revenueCents)} tone="good" />
        <Figure label="AI billed" value={usdFromMicro(totals.billedMicroUsd)} />
        <Figure
          label="Profit"
          value={usdFromMicro(totals.profitMicroUsd)}
          tone={totals.profitMicroUsd >= 0 ? "good" : "bad"}
        />
      </div>

      {totals.daysPriced === 0 ? (
        <p className="rounded-lg border border-yellow-600/40 bg-yellow-600/10 px-4 py-3 text-sm">
          No billed AI cost has been pulled yet, so every cost column here is zero and profit
          is overstated by whatever the providers have charged. Add an admin key under AI and
          run the daily cron. Nothing is estimated in the meantime, on purpose.
        </p>
      ) : totals.daysUnpriced > 0 ? (
        <p className="rounded-lg border border-yellow-600/40 bg-yellow-600/10 px-4 py-3 text-sm">
          {totals.daysUnpriced} day{totals.daysUnpriced === 1 ? "" : "s"} in this range had AI
          usage but no billed figure yet, so that cost is missing rather than guessed. The
          daily pull fills them in, including retrospectively.
        </p>
      ) : null}

      {/* The reconciliation, stated rather than implied. The three always add up. */}
      <div className="rounded-lg border p-4">
        <h2 className="text-sm font-semibold">AI cost, reconciled</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Line label="Billed by providers" value={usdFromMicro(totals.billedMicroUsd)} />
          <Line label="Attributed to tenants" value={usdFromMicro(totals.attributedMicroUsd)} />
          <Line
            label="Unattributed"
            value={usdFromMicro(totals.unattributedMicroUsd)}
            muted={totals.unattributedMicroUsd === 0}
          />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Billed comes from each provider&apos;s own cost report, not from a price list, so it is
          the same number as the invoice. Tenant figures are shares of it, split by the tokens
          recorded against them, which reconciles to the day rather than to the individual
          call. Unattributed is spend no tenant claimed, usually platform generation.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Workspace</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Payments</th>
              <th className="px-3 py-2">Last paid</th>
              <th className="px-3 py-2 text-right">AI cost</th>
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
                  <td className="px-3 py-2 text-right tabular-nums">{usdFromMicro(r.expenseMicroUsd)}</td>
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
              <td className="px-3 py-2 text-right tabular-nums">
                {usdFromMicro(totals.attributedMicroUsd)}
              </td>
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

      {/* 🟡 The footer's AI column is ATTRIBUTED, not billed, so it can be read beside the
          rows above it. Profit uses BILLED, because unattributed spend is still our money
          going out. They differ by exactly the unattributed line in the panel above. */}
      <p className="text-xs text-[var(--muted-foreground)]">
        The AI total in the table is the attributed part, so it matches the rows. Profit is
        calculated against the full billed amount, including unattributed spend.
      </p>
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

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
      <dd className={`font-semibold tabular-nums ${muted ? "text-[var(--muted-foreground)]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
