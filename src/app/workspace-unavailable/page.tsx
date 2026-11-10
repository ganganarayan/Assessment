import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AppBrand } from "@/components/app-brand";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

/**
 * Where a login lands when its workspace is SUSPENDED or DELETED.
 *
 * 🔴 It used to be /dashboard, and that was a loop: /w sent a deleted workspace's admin
 * to /dashboard, and /dashboard sends anyone with a tenant straight back to /w. This page
 * reads the session directly (never through the /w guards, which are what sent the
 * person here) and offers the only thing left to do, which is sign out.
 */
export const metadata: Metadata = {
  title: "Workspace unavailable",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WorkspaceUnavailablePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const user = session.user as { id: string };
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenant: { select: { status: true, deletedAt: true } } },
  });
  const t = fresh?.tenant ?? null;
  // Nothing wrong with this account's workspace (or it has none): the app routes it on.
  if (!t || (!t.deletedAt && t.status !== "SUSPENDED")) redirect("/dashboard");

  const suspended = !t.deletedAt;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-6 py-12">
      <AppBrand href="/workspace-unavailable" />
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h1 className="text-xl font-bold tracking-tight">
          {suspended ? "This workspace is suspended" : "This workspace has been closed"}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {suspended
            ? "Sign-ins, funnels and messages are paused for now. Nothing has been deleted. Contact support to have it reinstated."
            : "It is no longer active, so it cannot be opened. If this is a mistake, contact support."}
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
