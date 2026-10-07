import Link from "next/link";
import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { listAssessments } from "@/features/assessment/data";
import { CopyPublicLink } from "@/features/assessment/components/admin/copy-public-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tenantOnly } from "@/lib/tenant/scope";
import { resolvePlan } from "@/lib/billing/entitlements";
import { resolveOnboardingVideoUrl } from "@/lib/settings/config";
import { OnboardingSteps } from "@/features/platform/components/onboarding-steps";

export const dynamic = "force-dynamic";

export default async function WorkspaceAssessmentsPage() {
  const { tenantId, impersonating } = await requireWorkspace();
  const [assessments, canEdit, resolved, onboardingVideoUrl] = await Promise.all([
    listAssessments(tenantOnly(tenantId)),
    currentUserCanEdit(),
    resolvePlan(tenantId),
    resolveOnboardingVideoUrl(),
  ]);
  // At the plan cap, the "New assessment" button points to Billing instead - so the
  // limit is clear before the form, not only at save. Super admins aren't limited.
  const cap = impersonating ? ({ ok: true } as const) : await assertCanCreateAssessment(tenantId);

  // The getting-started panel runs for the length of the trial and then gets out of the
  // way. It is first on the page because on day one it is the only thing worth reading;
  // an empty assessments list is not an instruction.
  return (
    <div className="flex flex-col gap-4">
      {resolved.trialing ? <OnboardingSteps videoUrl={onboardingVideoUrl} /> : null}
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
                        <span className="text-xs text-[var(--muted-foreground)]">View only</span>
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
