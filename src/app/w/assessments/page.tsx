import { requireWorkspace } from "@/lib/auth/guards";
import { listAssessments } from "@/features/assessment/data";

export const dynamic = "force-dynamic";

export default async function WorkspaceAssessmentsPage() {
  const { tenantId } = await requireWorkspace();
  const assessments = await listAssessments(tenantId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Your assessments — private to this workspace.
        </p>
      </div>
      {assessments.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-[var(--muted-foreground)]">
          No assessments yet. The full builder for your workspace is being finalized and will
          appear here shortly.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-center">Categories</th>
                <th className="px-3 py-2 text-center">Submissions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {assessments.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-medium">{a.title}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.slug}</td>
                  <td className="px-3 py-2">{a.status}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{a._count.categories}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{a._count.submissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
