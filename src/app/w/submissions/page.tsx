import { requireWorkspace } from "@/lib/auth/guards";
import { listSubmissions } from "@/features/assessment/data";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { labeledAnswers } from "@/features/assessment/custom-fields";
import { normalizeAttribution } from "@/lib/events/payload";
import { pickResultUrl } from "@/lib/events/completion";
import { timezoneForCountry } from "@/lib/geo";
import { AnalyticsToolbar } from "@/features/admin/components/analytics-toolbar";
import {
  SubmissionsTable,
  type SubmissionRow,
} from "@/features/admin/components/submissions-table";

export const dynamic = "force-dynamic";

export default async function WorkspaceSubmissionsPage() {
  const { tenantId } = await requireWorkspace();
  const submissions = await listSubmissions(100_000, tenantId);
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
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        <AnalyticsToolbar exportGroups={exportGroups} />
      </div>
      <p className="-mt-4 text-xs text-[var(--muted-foreground)]">
        Every submission to your assessments — private to this workspace. Type to search; click a
        column heading to sort.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No submissions yet.</p>
      ) : (
        <SubmissionsTable rows={rows} exportBase="/api/w/submissions/export" />
      )}
    </div>
  );
}
