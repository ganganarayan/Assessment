import { PlatformSupportThread } from "@/features/support/components/support-thread-screen";

/** One onboarding request, answered by the owner. One thread, shared by all four thread pages. */
export const dynamic = "force-dynamic";

export default async function AdminOnboardingThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlatformSupportThread kind="ONBOARDING" id={id} />;
}
