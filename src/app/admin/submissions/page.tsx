import { listSubmissions, getAssessmentForAnalytics } from "@/features/assessment/data";
import { actingTenantId } from "@/lib/tenant/acting";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { AnalyticsToolbar } from "@/features/admin/components/analytics-toolbar";
import { AssessmentScopeBar } from "@/features/admin/components/assessment-scope-bar";
import { getStatsFloor } from "@/lib/stats-floor";
import { formatIST } from "@/lib/date";
import { labeledAnswers } from "@/features/assessment/custom-fields";
import {
  SubmissionsTable,
  type SubmissionRow,
} from "@/features/admin/components/submissions-table";

export const dynamic = "force-dynamic";

const EXPORT_GROUPS = [
  {
    items: [
      { label: "CSV", href: "/api/admin/submissions/export?format=csv" },
      { label: "JSON", href: "/api/admin/submissions/export?format=json" },
    ],
  },
];

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string }>;
}) {
  const sp = await searchParams;
  const t = await actingTenantId();
  const scoped = sp.assessment ? await getAssessmentForAnalytics(sp.assessment, t) : null;
  // Load all so the live search box can match across every submission, not just a page.
  const submissions = await listSubmissions(
    100_000,
    t,
    scoped ? { assessmentId: scoped.id, floor: scoped.statsResetAt } : undefined,
  );
  // Effective reporting floor (Data window) actually applied to this list.
  const effectiveFloor: Date | null = scoped ? scoped.statsResetAt : t ? null : await getStatsFloor();
  const paid = await getPaidBySubmission(submissions.map((s) => s.id));
  const rows: SubmissionRow[] = submissions.map((s) => {
    const p = paid.get(s.id);
    return {
      id: s.id,
      slug: s.assessment.slug,
      assessmentTitle: s.assessment.title,
      createdAt: s.createdAt.toISOString(),
      firstName: s.leadFirstName,
      lastName: s.leadLastName,
      email: s.leadEmail,
      mobile: s.leadMobile,
      profession: s.leadProfession,
      totalScore: s.totalScore,
      maxScore: s.maxScore,
      bandTitle: s.resultBand?.title ?? null,
      status: s.status,
      paidAmount: p?.amount ?? null,
      paidAt: p?.at ?? null,
      customAnswers: labeledAnswers({
        optinFields: s.assessment.optinFields,
        optinAnswers: s.optinAnswers,
        preResultFields: s.assessment.preResultFields,
        preResultAnswers: s.preResultAnswers,
      }),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        {scoped ? null : <AnalyticsToolbar exportGroups={EXPORT_GROUPS} />}
      </div>
      {scoped ? (
        <AssessmentScopeBar assessmentTitle={scoped.title} allHref="/admin/submissions" />
      ) : null}
      <p className="-mt-4 text-xs text-[var(--muted-foreground)]">
        Grouped by assessment. Type to search; click a column heading to sort.
        {effectiveFloor
          ? ` · Showing from ${formatIST(effectiveFloor.toISOString())} IST (Data window).`
          : ""}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No submissions yet.</p>
      ) : (
        <SubmissionsTable rows={rows} />
      )}
    </div>
  );
}
