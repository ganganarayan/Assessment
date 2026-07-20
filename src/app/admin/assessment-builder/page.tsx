import Link from "next/link";
import { listAssessments } from "@/features/assessment/data";
import { actingTenantId } from "@/lib/tenant/acting";
import { currentUserCanEdit } from "@/lib/auth/guards";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AssessmentRowActions } from "@/features/assessment/components/admin/assessment-row-actions";

export const dynamic = "force-dynamic";

/** Assessment Builder: every assessment (draft + published). Click one to open it
 *  in the builder (Assessment + Results pages). Create / import / export live here. */
export default async function AssessmentBuilderPage() {
  const [assessments, canEdit] = await Promise.all([
    listAssessments(await actingTenantId()),
    currentUserCanEdit(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Assessment Builder</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Link href="/admin/import" className={buttonVariants({ variant: "outline" })}>
              Import
            </Link>
          ) : null}
          <details className="relative">
            <summary className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer list-none")}>
              Export All ▼
            </summary>
            <div className="absolute right-0 z-10 mt-1 flex w-40 flex-col rounded-md border bg-[var(--background)] p-1 text-sm shadow">
              <a href="/api/admin/assessments/export-all?format=json" className="rounded px-2 py-1.5 hover:bg-[var(--muted)]">JSON</a>
              <a href="/api/admin/assessments/export-all?format=csv" className="rounded px-2 py-1.5 hover:bg-[var(--muted)]">CSV</a>
            </div>
          </details>
          {canEdit ? (
            <Link href="/admin/assessments/new" className={buttonVariants()}>
              New assessment
            </Link>
          ) : null}
        </div>
      </div>

      {assessments.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No assessments yet. Create your first one.</p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {assessments.map((a) => (
            <div key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {canEdit ? (
                    <Link href={`/admin/assessments/${a.id}`} className="font-medium hover:underline">
                      {a.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{a.title}</span>
                  )}
                  <Badge variant={a.status === "PUBLISHED" ? "success" : "muted"}>{a.status}</Badge>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  /a/{a.slug} · {a._count.categories} categories · {a._count.submissions} submissions
                </p>
              </div>
              <AssessmentRowActions id={a.id} slug={a.slug} published={a.status === "PUBLISHED"} canEdit={canEdit} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
