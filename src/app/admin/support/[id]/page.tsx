import { PlatformSupportThread } from "@/features/support/components/support-thread-screen";

/** One ticket, answered by the owner. One thread, shared by all four thread pages. */
export const dynamic = "force-dynamic";

export default async function AdminTicketThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlatformSupportThread kind="SUPPORT" id={id} />;
}
