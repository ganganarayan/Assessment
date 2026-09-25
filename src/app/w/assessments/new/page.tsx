import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { AssessmentForm } from "@/features/assessment/components/admin/assessment-form";
import { buttonVariants } from "@/components/ui/button";
import { listPromptVersions } from "@/lib/ai/versions";

export const dynamic = "force-dynamic";

export default async function WorkspaceNewAssessmentPage() {
  // Gate access (redirects a non-tenant caller). createAssessment stamps the
  // acting tenant, so the new assessment is owned by this workspace.
  const { tenantId, impersonating } = await requireWorkspace();
  if (!(await currentUserCanEdit())) redirect("/w/assessments");

  // Billing gate — check the plan cap UP FRONT so we don't let the user fill the
  // whole form only to be blocked at save. A super admin acting in a tenant
  // (impersonating) is never limited, matching createAssessment.
  const cap = impersonating ? ({ ok: true } as const) : await assertCanCreateAssessment(tenantId);
  if (!cap.ok) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link href="/w/assessments" className="text-sm underline">
            ← Assessments
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">New assessment</h1>
        </div>
        <div className="flex flex-col items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-4 text-sm">
          <p className="text-[var(--foreground)]">
            You&apos;ve reached your plan&apos;s limit of{" "}
            <span className="font-semibold">
              {cap.limit} assessment{cap.limit === 1 ? "" : "s"}
            </span>
            . Upgrade your plan to create more.
          </p>
          <Link href="/w/billing" className={buttonVariants({ size: "sm" })}>
            Upgrade plan
          </Link>
        </div>
      </div>
    );
  }

  const promptVersions = (await listPromptVersions(tenantId)).map((v) => ({ id: v.id, label: v.label }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/w/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">New assessment</h1>
      </div>
      <AssessmentForm mode="create" basePath="/w/assessments" promptVersions={promptVersions} />
    </div>
  );
}
