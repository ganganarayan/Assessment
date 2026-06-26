import { listSubmissions } from "@/features/assessment/data";
import { AnalyticsToolbar } from "@/features/admin/components/analytics-toolbar";
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

export default async function SubmissionsPage() {
  const submissions = await listSubmissions();
  const rows: SubmissionRow[] = submissions.map((s) => ({
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
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        <AnalyticsToolbar exportGroups={EXPORT_GROUPS} />
      </div>
      <p className="-mt-4 text-xs text-[var(--muted-foreground)]">
        Grouped by assessment. Click a column heading to sort. Export includes every submission with
        its score, overall band, UTMs, category results, and all AI-message versions. Shows the latest 100.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No submissions yet.</p>
      ) : (
        <SubmissionsTable rows={rows} />
      )}
    </div>
  );
}
