import type { Metadata } from "next";
import { loadManageView } from "@/features/calendar/manage";
import { ManageBooking } from "@/features/calendar/components/manage-booking";

/**
 * "Change or cancel my booking": /b/manage/<publicToken>.
 *
 * The token in the link IS the authorisation - the same per-appointment capability that
 * serves their .ics - because the person holding it has no account here and never will.
 * An unknown token renders a plain "no longer valid" rather than a 404 error page: the
 * commonest reason to arrive with one is an old email, and that is not an error anybody
 * needs to debug.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your booking",
  // Never indexed. It is one person's appointment.
  robots: { index: false, follow: false },
};

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadManageView(token);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-8">
      {view ? (
        <>
          <header className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">{view.hostName}</p>
            <h1 className="text-2xl font-bold tracking-tight">Your booking</h1>
          </header>
          <ManageBooking view={view} />
        </>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border p-5">
          <h1 className="text-lg font-semibold">This link is no longer valid</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            It may be from an older email, or the booking may have been removed. If you still need to
            change a call, reply to the confirmation you were sent.
          </p>
        </div>
      )}
    </main>
  );
}
