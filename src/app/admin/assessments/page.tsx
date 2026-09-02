import Link from "next/link";
import { listAssessments } from "@/features/assessment/data";
import { actingTenantId } from "@/lib/tenant/acting";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/** Assessments: the PUBLISHED (live) assessments only — an overview with public
 *  links. Editing/creating lives in the Assessment Builder. */
export default async function AssessmentsPage() {
  const all = await listAssessments(await actingTenantId());
  const published = all.filter((a) => a.status === "PUBLISHED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
        <Link href="/admin/assessment-builder" className={buttonVariants({ variant: "outline" })}>
          Open Assessment Builder
        </Link>
      </div>

      {published.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No published assessments yet. Build and publish one in the{" "}
          <Link href="/admin/assessment-builder" className="underline">Assessment Builder</Link>.
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {published.map((a) => (
            <div key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.title}</span>
                  <Badge variant="success">LIVE</Badge>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  /a/{a.slug} · {a._count.categories} categories · {a._count.submissions} submissions
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/a/${a.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  View public page
                </a>
                <Link
                  href={`/admin/assessments/${a.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Open in builder
                </Link>
                <Link href={`/admin/analytics/stats?assessment=${a.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Stats
                </Link>
                <Link href={`/admin/submissions?assessment=${a.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Submissions
                </Link>
                <Link href={`/admin/data-window?assessment=${a.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Data window
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
