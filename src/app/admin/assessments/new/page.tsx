import Link from "next/link";
import { AssessmentForm } from "@/features/assessment/components/admin/assessment-form";
import { listPromptVersions } from "@/lib/ai/versions";
import { actingTenantId } from "@/lib/tenant/acting";

export const dynamic = "force-dynamic";

export default async function NewAssessmentPage() {
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
