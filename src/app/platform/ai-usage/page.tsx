import { requireSuperAdmin } from "@/lib/auth/guards";
import { formatIST, formatISTDate } from "@/lib/date";
import { getAiUsageByTenant } from "@/features/admin/data/ai-usage";
import { usdFromMicro } from "@/features/admin/data/accounts";

export const dynamic = "force-dynamic";

/**
 * AI usage, per workspace, cumulative.
 *
 * One line per tenant that keeps adding up: every AI call the app makes writes a usage
 * row, and this page sums them. Never a list of individual calls. Money is an estimate
 * at list price; Revenue carries the billed figure once the providers' cost reports
 * are pulled.
 */
export default async function PlatformAiUsagePage() {
  await requireSuperAdmin();
  const { rows, totals, since } = await getAiUsageByTenant();
  const n = (v: number) => v.toLocaleString("en-IN");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI usage</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Every AI call, added up per workspace{since ? ` since ${formatISTDate(since)}` : ""}. Tokens are the
          providers&apos; own counts. Cost is estimated at list price; the billed figure is on Revenue.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Our AI spend (estimated, all time)" value={usdFromMicro(totals.platformMicroUsd)} />
        <Figure label="Our AI spend this month" value={usdFromMicro(totals.monthPlatformMicroUsd)} />
        <Figure label="AI calls (all time)" value={n(totals.calls)} />
      </div>

      {totals.unpricedCalls > 0 ? (
        <p className="rounded-lg border border-yellow-600/40 bg-yellow-600/10 px-4 py-3 text-sm">
          {n(totals.unpricedCalls)} call{totals.unpricedCalls === 1 ? "" : "s"} used a model with no list price set, so
          their tokens are counted and their cost is missing rather than guessed.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
          No AI calls recorded yet. The first statement, builder generation or nurture message will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Workspace</th>
                <th className="px-3 py-2 text-right">Calls</th>
                <th className="px-3 py-2 text-right">Tokens in / out</th>
                <th className="px-3 py-2 text-right">Our cost</th>
                <th className="px-3 py-2 text-right">This month</th>
                <th className="px-3 py-2 text-right">On their own key</th>
                <th className="px-3 py-2">Models</th>
                <th className="px-3 py-2">Last call</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.tenantId ?? "none"}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.name}</span>{" "}
                    {r.slug ? <span className="text-xs text-[var(--muted-foreground)]">{r.slug}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.calls)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {n(r.inputTokens)} / {n(r.outputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{usdFromMicro(r.platformMicroUsd)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {usdFromMicro(r.monthPlatformMicroUsd)}{" "}
                    <span className="text-xs text-[var(--muted-foreground)]">({n(r.monthCalls)})</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--muted-foreground)]">
                    {r.ownKeyMicroUsd > 0 ? usdFromMicro(r.ownKeyMicroUsd) : "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]">{r.models.join(", ")}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                    {r.lastAt ? formatIST(r.lastAt) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-[var(--muted)]/50 font-medium">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(totals.calls)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {n(totals.inputTokens)} / {n(totals.outputTokens)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{usdFromMicro(totals.platformMicroUsd)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{usdFromMicro(totals.monthPlatformMicroUsd)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totals.ownKeyMicroUsd > 0 ? usdFromMicro(totals.ownKeyMicroUsd) : "-"}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </main>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
