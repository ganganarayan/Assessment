import { PlatformSupportList } from "@/features/support/components/support-list-screen";

/** The owner's ticket queue, every workspace. The screen is shared by all four queue pages. */
export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  return <PlatformSupportList kind="SUPPORT" />;
}
