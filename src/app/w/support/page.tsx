import { TenantSupportList } from "@/features/support/components/support-list-screen";

/** Raise a ticket, and the tenant's own tickets. The screen is shared by all four queue pages. */
export const dynamic = "force-dynamic";

export default async function WorkspaceTicketsPage() {
  return <TenantSupportList kind="SUPPORT" />;
}
