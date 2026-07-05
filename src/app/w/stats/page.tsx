import { requireWorkspace } from "@/lib/auth/guards";
import {
  getAnalyticsStats,
  getUtmBreakdown,
  listPageViews,
} from "@/features/admin/data/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangeFilter } from "@/features/admin/components/date-range-filter";
import { formatIST } from "@/lib/date";

export const dynamic = "force-dynamic";

const dash = (v: string | null) => (v && v.trim() ? v : "—");

export default async function WorkspaceStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { tenantId } = await requireWorkspace();
  const sp = await searchParams;
  const range = { from: sp.from, to: sp.to };
  const [s, utm, log] = await Promise.all([
    getAnalyticsStats(range, tenantId),
    getUtmBreakdown(range, tenantId),
    listPageViews({ ...range, limit: 100, tenantId }),
  ]);

  const items = [
    { label: "Opt-in page views", value: s.totalViews },
    { label: "Unique opt-in views", value: s.uniqueViews },
    { label: "Opted in", value: s.optins },
    { label: "Completed assessment", value: s.completed },
    { label: "VSL loads (result shown)", value: s.vslLoads },
  ];

  const note =
    sp.from || sp.to
      ? `Showing ${sp.from ?? "start"} → ${sp.to ?? "today"} (IST).`
      : "Your funnel numbers across your assessments (all time).";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{note}</p>
      </div>

      <DateRangeFilter basePath="/w/stats" from={sp.from} to={sp.to} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Card key={it.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">
                {it.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold tabular-nums">{it.value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold tabular-nums text-green-600">{s.paidCount.toLocaleString()}</p>
            <p className="text-sm text-[var(--muted-foreground)]">₹{s.paidAmount.toLocaleString()} total</p>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Traffic by UTM</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Page views grouped by campaign tags. Populates before any lead opts in.
          </p>
        </div>
        {utm.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No page views yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-1.5">Source</th>
                  <th className="px-3 py-1.5">Medium</th>
                  <th className="px-3 py-1.5">Campaign</th>
                  <th className="px-3 py-1.5">Term</th>
                  <th className="px-3 py-1.5">Content</th>
                  <th className="px-3 py-1.5 text-right">Views</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {utm.map((r) => (
                  <tr key={[r.source, r.medium, r.campaign, r.term, r.content].join("|")}>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.source)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.medium)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.campaign)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.term)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.content)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {r.views.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Page-view log</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Latest {log.length.toLocaleString()} visits. A visitor becomes a contact once they opt in.
          </p>
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No page views yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="whitespace-nowrap px-3 py-1.5">Time (IST)</th>
                  <th className="px-3 py-1.5">Source</th>
                  <th className="px-3 py-1.5">Medium</th>
                  <th className="px-3 py-1.5">Campaign</th>
                  <th className="px-3 py-1.5">fbclid</th>
                  <th className="px-3 py-1.5">gclid</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {log.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                      {formatIST(r.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.source)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.medium)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.campaign)}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-xs" title={r.fbclid ?? ""}>
                      {dash(r.fbclid)}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-xs" title={r.gclid ?? ""}>
                      {dash(r.gclid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
