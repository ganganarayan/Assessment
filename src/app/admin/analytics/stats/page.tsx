import { getAnalyticsStats } from "@/features/admin/data/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const s = await getAnalyticsStats();
  const items = [
    { label: "Opt-in page views", value: s.totalViews },
    { label: "Unique opt-in views", value: s.uniqueViews },
    { label: "Opted in", value: s.optins },
    { label: "Completed assessment", value: s.completed },
    { label: "VSL loads (result shown)", value: s.vslLoads },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Funnel numbers across all assessments.
        </p>
      </div>
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
