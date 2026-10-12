import { requireSuperAdmin } from "@/lib/auth/guards";
import { resolveActingTenant } from "@/lib/tenant/acting";
import { prisma } from "@/lib/db/prisma";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { ImpersonationBanner } from "@/features/admin/components/impersonation-banner";
import { AppFooter } from "@/components/app-footer";
import { BuilderTabProvider } from "@/features/admin/components/builder-tab-context";
import { supportPendingCounts } from "@/features/support/data";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSuperAdmin();
  // If a super admin has "entered" a tenant, show the impersonation banner.
  const acting = await resolveActingTenant();
  // The red counts on the rail. The query SKIPS a queue that is not set to in-app, so
  // this is one cheap grouped count and nothing at all once support moves to email.
  const pending = await supportPendingCounts();
  const tenantName =
    acting.impersonating && acting.tenantId
      ? (await prisma.tenant.findUnique({ where: { id: acting.tenantId }, select: { name: true } }))?.name ?? "tenant"
      : null;

  return (
    <BuilderTabProvider>
      <div className="md:flex md:min-h-screen">
        <AdminSidebar
          user={{ name: user.name, email: user.email }}
          tenantName={tenantName}
          badges={{ "/admin/support": pending.SUPPORT, "/admin/onboarding": pending.ONBOARDING }}
        />
        <main className="min-w-0 flex-1">
          {tenantName ? <ImpersonationBanner tenantName={tenantName} /> : null}
          <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
          <AppFooter />
        </main>
      </div>
    </BuilderTabProvider>
  );
}
