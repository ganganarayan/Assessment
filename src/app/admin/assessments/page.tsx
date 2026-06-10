import Link from "next/link";
import { listAssessments } from "@/features/assessment/data";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AssessmentRowActions } from "@/features/assessment/components/admin/assessment-row-actions";

export const dynamic = "force-dynamic";

export default async function AssessmentsPage() {
  const assessments = await listAssessments();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/import" className={buttonVariants({ variant: "outline" })}>
            Import
          </Link>
          <details className="relative">
            <summary
              className={cn(
                buttonVariants({ variant: "outline" }),
                "cursor-pointer list-none",
              )}
            >
              Export All ▼
            </summary>
            <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col rounded-md border bg-[var(--background)] p-1 text-sm shadow">
              <a href="/api/admin/assessments/export-all?format=json" className="rounded px-2 py-1.5 hover:bg-[var(--muted)]">
                JSON
              </a>
              <a href="/api/admin/assessments/export-all?format=structure-csv" className="rounded px-2 py-1.5 hover:bg-[var(--muted)]">
                Assessment Structure CSV
              </a>
              <a href="/api/admin/assessments/export-all?format=responses-csv" className="rounded px-2 py-1.5 hover:bg-[var(--muted)]">
                Responses CSV
              </a>
            </div>
          </details>
          <Link href="/admin/assessments/new" className={buttonVariants()}>
            New assessment
          </Link>
        </div>
      </div>

      {assessments.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No assessments yet. Create your first one.
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {assessments.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/assessments/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.title}
                  </Link>
                  <Badge variant={a.status === "PUBLISHED" ? "success" : "muted"}>
                    {a.status}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  /a/{a.slug} · {a._count.categories} categories ·{" "}
                  {a._count.submissions} submissions
                </p>
              </div>
              <AssessmentRowActions
                id={a.id}
                slug={a.slug}
                published={a.status === "PUBLISHED"}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
