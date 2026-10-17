import { requireWorkspace } from "@/lib/auth/guards";
import { tenantOnly } from "@/lib/tenant/scope";
import { GateQualifiedView } from "@/features/admin/components/gate-qualified-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceGateQualifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string; from?: string; to?: string }>;
}) {
  const { tenantId } = await requireWorkspace();
  return (
    <GateQualifiedView
      scope={tenantOnly(tenantId)}
      basePath="/w/gate-qualified"
      searchParams={await searchParams}
    />
  );
}
