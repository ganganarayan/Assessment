import Link from "next/link";
import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { listAssessments } from "@/features/assessment/data";
import { CopyPublicLink } from "@/features/assessment/components/admin/copy-public-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tenantOnly } from "@/lib/tenant/scope";
import { formatIST } from "@/lib/date";
import { funnelOverage } from "@/lib/billing/overage";

export const dynamic = "force-dynamic";

export default async function WorkspaceAssessmentsPage() {
  const { tenantId, impersonating } = await requireWorkspace();
  const [assessments, canEdit] = await Promise.all([listAssessments(tenantOnly(tenantId)), currentUserCanEdit()]);
  // At the plan cap, the "New assessment" button points to Billing instead - so the
  // limit is clear before the form, not only at save. Super admins aren't limited.
  const cap = impersonating ? ({ ok: true } as const) : await assertCanCreateAssessment(tenantId);
  // Published funnels past the plan's limit (after a downgrade) are not serving. Said
  // here, by name, so the tenant is not left wondering why a live link shows "paused".
  const overage = await funnelOverage(tenantId);
  const paused = new Set(overage.pausedIds);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Your assessments - private to this workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export is a read, so it stays available to view-only staff and at the
              plan cap - unlike Import and New assessment below. The route scopes to
              this workspace. */}
          <details className="relative">
            <summary
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "cursor-pointer list-none",
              )}
            >
              Export All ▼
            </summary>
            <div className="absolute right-0 z-10 mt-1 flex w-40 flex-col rounded-md border bg-[var(--background)] p-1 text-sm shadow">
              <a
                href="/api/admin/assessments/export-all?format=json"
                className="rounded px-2 py-1.5 hover:bg-[var(--muted)]"
              >
                JSON
              </a>
              <a
                href="/api/admin/assessments/export-all?format=csv"
                className="rounded px-2 py-1.5 hover:bg-[var(--muted)]"
              >
                CSV
              </a>
            </div>
          </details>
          {canEdit ? (
            <>
            {cap.ok ? (
              <Link href="/w/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Import
              </Link>
            ) : null}
            {cap.ok ? (
              <Link href="/w/assessments/new" className={buttonVariants({ size: "sm" })}>
                + New assessment
              </Link>
            ) : (
              <Link href="/w/billing" className={buttonVariants({ size: "sm" })} title={`Plan limit: ${cap.limit} assessment${cap.limit === 1 ? "" : "s"}`}>
                Upgrade to add more
              </Link>
            )}
            </>
          ) : null}
        </div>
      </div>
      {paused.size > 0 ? (
        <div className="rounded-lg border border-amber-500 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">
            {paused.size} published funnel{paused.size === 1 ? " is" : "s are"} paused: your plan includes {overage.limit} live funnel{overage.limit === 1 ? "" : "s"}.
          </p>
          <p className="mt-1 text-[var(--muted-foreground)]">
            The ones you published first stay live. Upgrade, or unpublish{" "}
            {paused.size === 1 ? "one funnel" : `${paused.size} funnels`}, to turn the rest back on. Nothing has been deleted.
          </p>
        </div>
      ) : null}
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
                <th className="px-3 py-2">Created</th>
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
                  <td className="px-3 py-2">
                    {a.status}
                    {paused.has(a.id) ? (
                      <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                        Paused, over plan
                      </span>
                    ) : null}
                  </td>
                  {/* An import creates a fresh row, so createdAt is the import time -
                      one column answers both "when did I build this" and "when did I
                      bring it in". Rendered in IST off a fixed offset, because the
                      server itself runs UTC. */}
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                    {formatIST(a.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{a._count.categories}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{a._count.submissions}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {/* Public link only makes sense once live - a draft's /a/{slug}
                          isn't served yet. */}
                      {a.status === "PUBLISHED" ? (
                        <CopyPublicLink slug={a.slug} />
                      ) : null}
                      {canEdit ? (
                        <Link
                          href={`/w/assessments/${a.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Edit
                        </Link>
                      ) : (
                        // View-only staff cannot open the builder (its saves would all be
                        // refused), so they read the funnel the way a respondent sees it:
                        // the preview, which never reports to Meta.
                        <a
                          href={`/a/${a.slug}?preview=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Preview
                        </a>
                      )}
                    </div>
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
