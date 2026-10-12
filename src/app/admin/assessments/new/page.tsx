import Link from "next/link";
import { redirect } from "next/navigation";
import { AssessmentForm } from "@/features/assessment/components/admin/assessment-form";
import { listPromptVersions } from "@/lib/ai/versions";
import { getAudienceListsForTenant } from "@/features/admin/actions/audience-list";
import { getAdAccountsForTenant } from "@/features/admin/actions/ad-account";
import { resolveActingScope, actingConfigTenantId } from "@/lib/tenant/acting";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { currentUserCanEdit } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function NewAssessmentPage() {
  if (!(await currentUserCanEdit())) redirect("/admin/assessment-builder");
  const configTenantId = await actingConfigTenantId();
  const promptVersions = (await listPromptVersions(configTenantId)).map((v) => ({ id: v.id, label: v.label }));
  const audienceLists = await getAudienceListsForTenant(configTenantId);
  // The accounts the Meta tracking step may point this funnel at.
  const adAccounts = await getAdAccountsForTenant(configTenantId);
  // The signup-funnel switch only exists in the platform's own scope.
  const scope = await resolveActingScope();
  const canPlatformSignup = scope.isSuper && isPlatformScope(scope.tenantId);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">New assessment</h1>
      </div>
      <AssessmentForm mode="create" promptVersions={promptVersions} audienceLists={audienceLists} adAccounts={adAccounts} canPlatformSignup={canPlatformSignup} />
    </div>
  );
}
