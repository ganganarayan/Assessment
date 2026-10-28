import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { WelcomeBack } from "@/features/auth/components/welcome-back";

/**
 * Where a soft-deleted login is sent after it signs back in (see dashboard/page.tsx).
 *
 * It reads the session and the live account state DIRECTLY - never through requireUser
 * or the /w guards. Those guards treat a deleted account as "cookie outlived its
 * session" and bounce it to /sign-in?expired=1, which is exactly the screen we are
 * trying to replace with an explicit "welcome back" choice. So the gate lives here.
 */
export const metadata: Metadata = {
  title: "Welcome back",
  robots: { index: false, follow: false },
};

/** Session-dependent and account-state-dependent: must never be prerendered. */
export const dynamic = "force-dynamic";

export default async function WelcomeBackPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const user = session.user as { id: string; name?: string | null };
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deletedAt: true },
  });
  // Only a removed account belongs here. An active user who wanders in (or one who has
  // just reactivated) goes to the app, which routes them on to their workspace.
  if (!fresh?.deletedAt) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <WelcomeBack name={user.name ?? null} />
    </main>
  );
}
