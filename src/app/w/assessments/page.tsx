import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { listAssessments } from "@/features/assessment/data";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkspaceAssessmentsPage() {
  const { tenantId } = await requireWorkspace();
  const assessments = await listAssessments(tenantId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Your assessments — private to this workspace.
          </p>
        </div>
        <Link href="/w/assessments/new" className={buttonVariants({ size: "sm" })}>
          + New assessment
        </Link>
      </div>
      {assessments.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-[var(--muted-foreground)]">
          No assessments yet. Click <strong>New assessment</strong> to build your first one.
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
                <th className="px-3 py-2"></th>
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
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/w/assessments/${a.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
