import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangeFilter } from "@/features/admin/components/date-range-filter";
import { getPlatformFunnelStats, getPlatformUtmBreakdown } from "@/features/admin/data/platform-analytics";

export const dynamic = "force-dynamic";

const dash = (v: string | null) => (v && v.trim() ? v : "—");

/**
 * Assess360 SaaS marketing-funnel dashboard (super-admin). Top-of-funnel landing
 * views + UTM (from PlatformPageView), signups (tenants), and paid (active
 * subscriptions + MRR) — so ad traffic is traceable through to paying tenants.
 */
export default async function PlatformStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const range = { from: sp.from, to: sp.to };
  const [s, utm] = await Promise.all([getPlatformFunnelStats(range), getPlatformUtmBreakdown(range)]);

  const tiles = [
    { label: "Landing page views", value: s.landingViews },
    { label: "Unique visitors", value: s.uniqueViews },
    { label: "Signups (tenants)", value: s.signups },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing stats</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            The Assess360 SaaS funnel: landing traffic → free signups → paid subscriptions.
            {sp.from || sp.to ? ` Showing ${sp.from ?? "start"} → ${sp.to ?? "today"} (IST).` : " All time."}
          </p>
        </div>
        <Link href="/platform" className="text-sm underline">
          ← Platform console
        </Link>
      </div>

      <DateRangeFilter basePath="/platform/stats" from={sp.from} to={sp.to} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">{t.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold tabular-nums">{t.value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">Paid (active)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold tabular-nums text-green-600">{s.paidCount.toLocaleString()}</p>
            <p className="text-sm text-[var(--muted-foreground)]">${s.mrrUsd.toLocaleString()} / mo</p>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Traffic by UTM</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Landing views grouped by campaign tags — populates from your ads before any signup.
          </p>
        </div>
        {utm.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No landing views yet.</p>
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
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{r.views.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
