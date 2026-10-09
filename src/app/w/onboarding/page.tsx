import { TenantSupportList } from "@/features/support/components/support-list-screen";

/** Ask for onboarding help, and the tenant's own requests. The screen is shared by all four queue pages. */
export const dynamic = "force-dynamic";

export default async function WorkspaceOnboardingPage() {
  return <TenantSupportList kind="ONBOARDING" />;
}
