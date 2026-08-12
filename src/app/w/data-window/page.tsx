import { getStatsWindow, getAssessmentStatsWindow } from "@/features/admin/actions/stats-window";
import { StatsWindowForm } from "@/features/admin/components/stats-window-form";
import { AssessmentScopeBar } from "@/features/admin/components/assessment-scope-bar";
import { getAssessmentForAnalytics } from "@/features/assessment/data";
import { actingTenantId } from "@/lib/tenant/acting";
import { requireWorkspace } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/** Tenant workspace Data window — same as /admin/data-window, scoped to this tenant. */
export default async function WorkspaceDataWindowPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string }>;
}) {
  await requireWorkspace();
  const sp = await searchParams;
  const scoped = sp.assessment
    ? await getAssessmentForAnalytics(sp.assessment, await actingTenantId())
    : null;

  const r = scoped ? await getAssessmentStatsWindow(scoped.id) : await getStatsWindow();
  const startAtInput = r.ok ? (r.data?.startAtInput ?? "") : "";
  const startAtIso = r.ok ? (r.data?.startAtIso ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data window</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Pick the date your reporting starts from. The Stats, Contacts, and Submissions
          {scoped ? " for this assessment" : " (and Dashboard)"} then show only data from then
          onward — a clean slate without deleting anything. Clear it to see all history again.
        </p>
      </div>
      {scoped ? (
        <AssessmentScopeBar assessmentTitle={scoped.title} allHref="/w/data-window" />
      ) : null}
      <StatsWindowForm
        startAtInput={startAtInput}
        startAtIso={startAtIso}
        assessmentId={scoped?.id}
      />
    </div>
  );
}
