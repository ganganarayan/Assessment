import { requireSuperAdmin } from "@/lib/auth/guards";
import { resolveActingTenant } from "@/lib/tenant/acting";
import { prisma } from "@/lib/db/prisma";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { ImpersonationBanner } from "@/features/admin/components/impersonation-banner";
import { BuilderTabProvider } from "@/features/admin/components/builder-tab-context";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSuperAdmin();
  // If a super admin has "entered" a tenant, show the impersonation banner.
  const acting = await resolveActingTenant();
  const tenantName =
    acting.impersonating && acting.tenantId
      ? (await prisma.tenant.findUnique({ where: { id: acting.tenantId }, select: { name: true } }))?.name ?? "tenant"
      : null;

  return (
    <BuilderTabProvider>
      <div className="md:flex md:min-h-screen">
        <AdminSidebar user={{ name: user.name, email: user.email }} />
        <main className="min-w-0 flex-1">
          {tenantName ? <ImpersonationBanner tenantName={tenantName} /> : null}
          <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
        </main>
      </div>
    </BuilderTabProvider>
  );
}
