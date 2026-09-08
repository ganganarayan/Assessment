import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { listSubmissions, getAssessmentForAnalytics, listAssessments } from "@/features/assessment/data";
import { AssessmentPicker } from "@/features/admin/components/assessment-picker";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { labeledAnswers } from "@/features/assessment/custom-fields";
import { normalizeAttribution } from "@/lib/events/payload";
import { pickResultUrl } from "@/lib/events/completion";
import { timezoneForCountry } from "@/lib/geo";
import { formatIST } from "@/lib/date";
import { AnalyticsToolbar } from "@/features/admin/components/analytics-toolbar";
import { DateRangeFilter } from "@/features/admin/components/date-range-filter";
import {
  SubmissionsTable,
  type SubmissionRow,
} from "@/features/admin/components/submissions-table";

export const dynamic = "force-dynamic";

export default async function WorkspaceSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string; from?: string; to?: string }>;
}) {
  const { tenantId } = await requireWorkspace();
  const canDelete = await currentUserCanEdit();
  const sp = await searchParams;
  // Tenant-scoped: a foreign/bad id resolves to null (no leak) → falls back to all.
  const scoped = sp.assessment ? await getAssessmentForAnalytics(sp.assessment, tenantId) : null;
  const assessmentOptions = (await listAssessments(tenantId)).map((a) => ({ id: a.id, title: a.title }));
  // Scoped: the assessment's saved reporting start (statsResetAt) IS the "from"; the URL
  // from is ignored (it's the sticky per-assessment date). To stays an ad-hoc end date.
  const submissions = await listSubmissions(100_000, tenantId, {
    ...(scoped ? { assessmentId: scoped.id, floor: scoped.statsResetAt } : {}),
    from: scoped ? undefined : sp.from,
    to: sp.to,
  });
  const stickyStart = scoped?.statsResetAt ? formatIST(scoped.statsResetAt.toISOString()).split(" ")[0] : "";
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
        ? pickResultUrl({
            engine: s.assessment.engine,
            nextStep: s.assessment.nextStep,
            targetUrl: s.assessment.targetUrl,
            slug: s.assessment.slug,
            submissionId: s.id,
            token: s.resultToken,
          })
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
      timezone: s.timezone ?? timezoneForCountry(s.country),
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

  const exportGroups = [
    {
      items: [
        { label: "CSV", href: "/api/w/submissions/export?format=csv" },
        { label: "JSON", href: "/api/w/submissions/export?format=json" },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        <AnalyticsToolbar exportGroups={exportGroups} />
      </div>

      <AssessmentPicker
        assessments={assessmentOptions}
        selectedId={scoped?.id ?? null}
        basePath="/w/submissions"
      />

      <DateRangeFilter
        basePath="/w/submissions"
        from={sp.from}
        to={sp.to}
        extraQuery={scoped ? { assessment: scoped.id } : undefined}
        stickyStartAssessmentId={scoped?.id}
        stickyStartValue={stickyStart}
      />

      {scoped ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Showing this assessment from {stickyStart || "the beginning"}
          {sp.to ? ` → ${sp.to}` : ""} (IST). Type to search; click a column heading to sort.
        </p>
      ) : sp.from || sp.to ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Showing {sp.from ?? "start"} → {sp.to ?? "today"} (IST). Type to search; click a column heading to sort.
        </p>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Every submission to your assessments — private to this workspace. Type to search; click a
          column heading to sort.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No submissions yet.</p>
      ) : (
        <SubmissionsTable rows={rows} exportBase="/api/w/submissions/export" canDelete={canDelete} hideGroupTitle={!!scoped} />
      )}
    </div>
  );
}
