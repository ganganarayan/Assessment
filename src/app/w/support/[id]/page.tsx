import { TenantSupportThread } from "@/features/support/components/support-thread-screen";

/** One of the tenant's own tickets. One thread, shared by all four thread pages. */
export const dynamic = "force-dynamic";

export default async function WorkspaceTicketThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenantSupportThread kind="SUPPORT" id={id} />;
}
