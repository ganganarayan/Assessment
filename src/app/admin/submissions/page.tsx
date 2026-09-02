import { listSubmissions, getAssessmentForAnalytics } from "@/features/assessment/data";
import { actingTenantId } from "@/lib/tenant/acting";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { AnalyticsToolbar } from "@/features/admin/components/analytics-toolbar";
import { AssessmentScopeBar } from "@/features/admin/components/assessment-scope-bar";
import { getStatsFloor } from "@/lib/stats-floor";
import { formatIST } from "@/lib/date";
import { labeledAnswers } from "@/features/assessment/custom-fields";
import { normalizeAttribution } from "@/lib/events/payload";
import { resultUrlFor } from "@/lib/events/completion";
import {
  SubmissionsTable,
  type SubmissionRow,
} from "@/features/admin/components/submissions-table";

export const dynamic = "force-dynamic";

function exportGroups(assessmentId?: string) {
  const suffix = assessmentId ? `&assessment=${assessmentId}` : "";
  return [
    {
      items: [
        { label: "CSV", href: `/api/admin/submissions/export?format=csv${suffix}` },
        { label: "JSON", href: `/api/admin/submissions/export?format=json${suffix}` },
      ],
    },
  ];
}

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
  const effectiveFloor: Date | null = scoped ? scoped.statsResetAt : await getStatsFloor(t);
  const paid = await getPaidBySubmission(submissions.map((s) => s.id));
  const rows: SubmissionRow[] = submissions.map((s) => {
    const p = paid.get(s.id);
    return {
      id: s.id,
      slug: s.assessment.slug,
      assessmentId: s.assessmentId,
      assessmentTitle: s.assessment.title,
      createdAt: s.createdAt.toISOString(),
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      firstName: s.leadFirstName,
      lastName: s.leadLastName,
      email: s.leadEmail,
      mobile: s.leadMobile,
      profession: s.leadProfession,
      customerId: s.customerId,
      totalScore: s.totalScore,
      maxScore: s.maxScore,
      bandTitle: s.resultBand?.title ?? null,
      status: s.status,
      resultUrl: s.status === "COMPLETED"
        ? resultUrlFor(s.assessment.targetUrl, s.assessment.slug, s.id, s.resultToken)
        : null,
      paidAmount: p?.amount ?? null,
      paidAt: p?.at ?? null,
      vslLoads: s.resultFetchCount,
      deviceType: s.deviceType,
      browser: s.browser,
      os: s.os,
      country: s.country,
      city: s.city,
      region: s.region,
      timezone: s.timezone,
      attribution: normalizeAttribution(s.attribution),
      fbclidTimestamp: s.fbclidTimestamp,
      fbp: s.fbp,
      clientIp: s.clientIp,
      userAgent: s.userAgent,
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
        <AnalyticsToolbar exportGroups={exportGroups(scoped?.id)} />
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
