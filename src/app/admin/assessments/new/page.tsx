import Link from "next/link";
import { redirect } from "next/navigation";
import { AssessmentForm } from "@/features/assessment/components/admin/assessment-form";
import { listPromptVersions } from "@/lib/ai/versions";
import { actingTenantId } from "@/lib/tenant/acting";
import { currentUserCanEdit } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function NewAssessmentPage() {
  if (!(await currentUserCanEdit())) redirect("/admin/assessment-builder");
  const promptVersions = (await listPromptVersions(await actingTenantId())).map((v) => ({ id: v.id, label: v.label }));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">New assessment</h1>
      </div>
      <AssessmentForm mode="create" promptVersions={promptVersions} />
    </div>
  );
}
