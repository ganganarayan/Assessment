import { getStatsWindow } from "@/features/admin/actions/stats-window";
import { StatsWindowForm } from "@/features/admin/components/stats-window-form";

export const dynamic = "force-dynamic";

export default async function DataWindowPage() {
  const r = await getStatsWindow();
  const startAtInput = r.ok ? (r.data?.startAtInput ?? "") : "";
  const startAtIso = r.ok ? (r.data?.startAtIso ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data window</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Pick the date your reporting starts from. The Dashboard, Stats, Contacts, and Submissions
          then show only data from then onward — a clean slate without deleting anything. Clear it to
          see all your historical data again.
        </p>
      </div>
      <StatsWindowForm startAtInput={startAtInput} startAtIso={startAtIso} />
    </div>
  );
}
