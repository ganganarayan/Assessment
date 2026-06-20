import { getAnalyticsStats } from "@/features/admin/data/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClearDataButton } from "@/features/admin/components/clear-data-button";
import { DateRangeFilter } from "@/features/admin/components/date-range-filter";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const s = await getAnalyticsStats({ from: sp.from, to: sp.to });
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
      : "Funnel numbers across all assessments (all time).";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
          <p className="text-sm text-[var(--muted-foreground)]">{note}</p>
        </div>
        <ClearDataButton />
      </div>

      <DateRangeFilter basePath="/admin/analytics/stats" from={sp.from} to={sp.to} />
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
      </div>
    </div>
  );
}
