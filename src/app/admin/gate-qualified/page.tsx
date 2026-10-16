import { actingDataScope } from "@/lib/tenant/acting";
import { GateQualifiedView } from "@/features/admin/components/gate-qualified-view";

export const dynamic = "force-dynamic";

export default async function AdminGateQualifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string; from?: string; to?: string }>;
}) {
  // "which workspace is entered" is a different question from "which rows to list":
  // no workspace entered means every tenant, not rows owned by nobody.
  const scope = await actingDataScope();
  return (
    <GateQualifiedView
      scope={scope}
      basePath="/admin/gate-qualified"
      searchParams={await searchParams}
    />
  );
}
