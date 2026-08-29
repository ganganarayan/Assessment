import { requireWorkspace } from "@/lib/auth/guards";
import { listSubmissions } from "@/features/assessment/data";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { labeledAnswers } from "@/features/assessment/custom-fields";
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
      deviceType: s.deviceType,
      browser: s.browser,
      os: s.os,
      country: s.country,
      city: s.city,
      region: s.region,
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
      <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
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
