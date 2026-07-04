import { requireWorkspace } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { ImpersonationBanner } from "@/features/admin/components/impersonation-banner";
import { WorkspaceNav } from "@/features/workspace/components/workspace-nav";

/**
 * The tenant workspace shell. requireWorkspace resolves a CONCRETE acting tenant
 * (the tenant admin's own, or the one a super admin has entered). Only the pages
 * built under /w exist here, and each scopes its queries to that tenant — so no
 * unscoped page can leak another tenant's data.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, impersonating } = await requireWorkspace();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

  return (
    <div className="md:flex md:min-h-screen">
      <aside className="shrink-0 border-b md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="px-2">
            <p className="truncate text-lg font-semibold" title={tenant?.name ?? "Workspace"}>
              {tenant?.name ?? "Workspace"}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">Your workspace</p>
          </div>
          <WorkspaceNav />
          <div className="mt-auto">
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {impersonating && tenant ? <ImpersonationBanner tenantName={tenant.name} /> : null}
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
