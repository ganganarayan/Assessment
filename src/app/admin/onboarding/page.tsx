import { PlatformSupportList } from "@/features/support/components/support-list-screen";

/** The owner's onboarding queue, every workspace. The screen is shared by all four queue pages. */
export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage() {
  return <PlatformSupportList kind="ONBOARDING" />;
}
