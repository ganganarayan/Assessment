import { redirect } from "next/navigation";
import { requireUser, isSuperAdmin, isStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { ProvisionWorkspaceButton } from "@/features/platform/components/provision-workspace-button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { AppBrand } from "@/components/app-brand";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * /dashboard is a ROUTER, not a page.
 *
 * It used to be a landing screen: an account-details card, then a card announcing
 * that "your isolated assessment builder is being finalized and will appear here
 * shortly" above a button that opened the workspace which already existed. Both
 * statements were true of nothing - the workspace is provisioned at signup - and a
 * reassurance about isolation, offered before anyone has doubted it, creates the
 * doubt it answers. Worse, it stood between a new trial and the product, which is
 * the one thing a signup funnel is paying for.
 *
 * So everyone who has somewhere to go is sent there. The account facts it used to
 * display (tenant id, login email, role) are read-only data and live in Settings,
 * which is where someone looks for them.
 *
 * The only screen left is the genuine dead end: an account with no workspace,
 * because provisioning failed. That one needs an action, so it keeps a page.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  // Super = DB role SUPER_ADMIN OR the platform owner - so a PLATFORM STAFF (role
  // SUPER_ADMIN) is recognised as super and routed to /admin, and is never asked to
  // create a workspace. A tenant staff has a tenantId and lands on their workspace.
  const isSuper = isSuperAdmin(user);
  if (isSuper) redirect("/admin");

  // Read the live tenant from the DB - the session copy of tenantId can be stale
  // right after self-provisioning (before the next login refreshes the session).
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true },
  });
  const tenantId = dbUser?.tenantId ?? user.tenantId ?? null;
  if (tenantId) redirect("/w");

  // No workspace. Staff wait to be assigned; everyone else can provision one.
  const staff = isStaff(user);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <AppBrand href="/dashboard" />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Set up your workspace</h1>
        <SignOutButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{staff ? "Waiting for access" : "No workspace yet"}</CardTitle>
          <CardDescription>
            {staff
              ? "Your account is not linked to a workspace yet. Ask your admin to assign you."
              : "Create one to start building assessments."}
          </CardDescription>
        </CardHeader>
        {staff ? null : (
          <CardContent>
            <ProvisionWorkspaceButton />
          </CardContent>
        )}
      </Card>
    </main>
  );
}
