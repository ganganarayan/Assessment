import { listSubmissions, getAssessmentForAnalytics, listAssessments } from "@/features/assessment/data";
import { actingTenantId } from "@/lib/tenant/acting";
import { AssessmentPicker } from "@/features/admin/components/assessment-picker";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { AnalyticsToolbar } from "@/features/admin/components/analytics-toolbar";
import { DateRangeFilter } from "@/features/admin/components/date-range-filter";
import { getStatsFloor } from "@/lib/stats-floor";
import { formatIST } from "@/lib/date";
import { labeledAnswers } from "@/features/assessment/custom-fields";
import { normalizeAttribution } from "@/lib/events/payload";
import { pickResultUrl } from "@/lib/events/completion";
import { timezoneForCountry } from "@/lib/geo";
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
  searchParams: Promise<{ assessment?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const t = await actingTenantId();
  const assessmentOptions = (await listAssessments(t)).map((a) => ({ id: a.id, title: a.title }));
  // Submissions is always scoped to one assessment (no cross-assessment "All" view):
  // use the URL id, else default to the newest assessment (list is createdAt desc).
  const scopedId = sp.assessment ?? assessmentOptions[0]?.id;
  const scoped = scopedId ? await getAssessmentForAnalytics(scopedId, t) : null;
  // Load all so the live search box can match across every submission, not just a page.
  // Scoped: the assessment's saved reporting start (statsResetAt) IS the "from", so the
  // URL from is ignored (it's the sticky per-assessment date). To stays an ad-hoc end.
  const submissions = await listSubmissions(100_000, t, {
    ...(scoped ? { assessmentId: scoped.id, floor: scoped.statsResetAt } : {}),
    from: scoped ? undefined : sp.from,
    to: sp.to,
  });
  const stickyStart = scoped?.statsResetAt ? formatIST(scoped.statsResetAt.toISOString()).split(" ")[0] : "";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        <AnalyticsToolbar exportGroups={exportGroups(scoped?.id)} />
      </div>

      <AssessmentPicker
        assessments={assessmentOptions}
        selectedId={scoped?.id ?? null}
        basePath="/admin/submissions"
        allowAll={false}
      />

      <DateRangeFilter
        basePath="/admin/submissions"
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
      ) : effectiveFloor ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Showing from {formatIST(effectiveFloor.toISOString())} IST (Data window). Type to search; click a column heading to sort.
        </p>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">Type to search; click a column heading to sort.</p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No submissions yet.</p>
      ) : (
        <SubmissionsTable rows={rows} canDelete hideGroupTitle={!!scoped} />
      )}
    </div>
  );
}
