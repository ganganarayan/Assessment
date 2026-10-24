import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { stopLifecycleByToken } from "@/features/platform/lifecycle-optout";

export const dynamic = "force-dynamic";

/**
 * Stop the trial sequence. Reached from the footer of every message it sends.
 *
 * 🔴 It does NOT unsubscribe on arrival. Mail security scanners fetch every link in
 * an email before the person sees it, so a GET that acted would quietly unsubscribe
 * people who never clicked. The stop happens on the POST the button makes.
 *
 * Its own route rather than /u/[token], which belongs to a tenant's contacts. The two
 * must not share: an owner escaping our trial emails has not opted their own leads out
 * of their own funnel.
 */
export default async function LifecycleStopPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const profile = await prisma.lifecycleProfile.findUnique({
    where: { optOutToken: token },
    select: { status: true },
  });
  // An unknown token is a 404 rather than a form, so this is not somewhere to guess.
  if (!profile) notFound();

  const stopped = profile.status === "UNSUBSCRIBED";

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {stopped ? "You are unsubscribed" : "Stop these emails"}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {stopped
            ? "We will not send you any more about your trial, by email or WhatsApp."
            : "Stop the messages about your trial. This covers email and WhatsApp together, and takes effect immediately."}
        </p>
      </div>

      {stopped ? null : (
        <form action={stopLifecycleByToken}>
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
          >
            Stop these emails
          </button>
        </form>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Your workspace, funnels and data are not affected. Messages about something you
        asked for, such as a password reset or a support reply, are not marketing and
        will still reach you.
      </p>
    </main>
  );
}
