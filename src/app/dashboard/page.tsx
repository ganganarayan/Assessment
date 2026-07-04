import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { isPlatformOwner } from "@/lib/auth/platform";
import { prisma } from "@/lib/db/prisma";
import { ProvisionWorkspaceButton } from "@/features/platform/components/provision-workspace-button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireUser();
  // MVP: platform owner is identified by email, not the DB role.
  const isSuperAdmin = isPlatformOwner(user.email);
  const roleLabel = isSuperAdmin ? "Super Admin" : "Admin";
  // Read the live tenant from the DB — the session copy of tenantId can be stale
  // right after self-provisioning (before the next login refreshes the session).
  const dbUser = isSuperAdmin
    ? null
    : await prisma.user.findUnique({ where: { id: user.id }, select: { tenantId: true } });
  const tenantId = dbUser?.tenantId ?? (isSuperAdmin ? null : user.tenantId ?? null);
  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } })
    : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {roleLabel} workspace
          </p>
        </div>
        <SignOutButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signed in</CardTitle>
          <CardDescription>Your account details.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Row label="Name" value={user.name} />
          <Row label="Username (email)" value={user.email} />
          <Row label="Role" value={roleLabel} />
          <Row label="Tenant ID" value={user.tenantId ?? "— (platform / none)"} />
        </CardContent>
      </Card>

      {isSuperAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Super Admin</CardTitle>
            <CardDescription>
              Platform-wide controls. Manage tenants, domains, and themes
              (coming in Phase 2).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-[var(--muted-foreground)]">
            <span>You have global access across all tenants.</span>
            <Link href="/admin" className={buttonVariants({ size: "sm" })}>
              Open Assessment Admin
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{tenant ? `Workspace: ${tenant.name}` : "Workspace"}</CardTitle>
            <CardDescription>
              {tenant
                ? "Your tenant is provisioned. Your isolated assessment builder is being finalized and will appear here shortly."
                : "You don't have a workspace yet — create one to start building assessments. Everything in it stays private to you."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-[var(--muted-foreground)]">
            {tenant ? (
              <>
                <span>
                  Everything you build — assessments, leads, webhooks, APIs — stays private to{" "}
                  <span className="font-mono">{tenant.slug}</span> and can&apos;t be seen by any other tenant.
                </span>
                <Link href="/w" className={buttonVariants({ size: "sm" })}>
                  Open my workspace →
                </Link>
              </>
            ) : (
              <ProvisionWorkspaceButton />
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
