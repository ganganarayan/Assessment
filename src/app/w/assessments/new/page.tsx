import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { AssessmentForm } from "@/features/assessment/components/admin/assessment-form";
import { listPromptVersions } from "@/lib/ai/versions";

export const dynamic = "force-dynamic";

export default async function WorkspaceNewAssessmentPage() {
  // Gate access (redirects a non-tenant caller). createAssessment stamps the
  // acting tenant, so the new assessment is owned by this workspace.
  const { tenantId } = await requireWorkspace();
  if (!(await currentUserCanEdit())) redirect("/w/assessments");
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
