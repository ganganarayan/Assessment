import { requireSuperAdmin } from "@/lib/auth/guards";
import { resolveActingTenant } from "@/lib/tenant/acting";
import { prisma } from "@/lib/db/prisma";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { ImpersonationBanner } from "@/features/admin/components/impersonation-banner";
import { AppFooter } from "@/components/app-footer";
import { BuilderTabProvider } from "@/features/admin/components/builder-tab-context";
import { supportPendingCounts } from "@/features/support/data";

/**
 * The owner's shell: the rail, the impersonation banner, the footer.
 *
 * 🔴 It is a component rather than a line in one layout because the owner's screens
 * live under TWO route trees. /admin had the shell and /platform had none, so walking
 * from Assessments to Tenants - one click in the same rail - made the rail itself
 * disappear, and the only way back was the browser's back button. A menu that vanishes
 * when you use it is worse than no menu, because you stop trusting that it is there.
 *
 * `contained` is the one difference between the two. /admin pages are bare fragments
 * and the shell gives them their column. /platform pages each bring their own <main>
 * with their own width, so the shell gives them room and nothing else - nesting <main>
 * inside <main> is not valid, and clamping a 6xl table to 5xl would crush it.
 */
export async function OwnerShell({
  children,
  contained = true,
}: {
  children: React.ReactNode;
  contained?: boolean;
}) {
  const user = await requireSuperAdmin();
  // If a super admin has "entered" a tenant, show the impersonation banner.
  const acting = await resolveActingTenant();
  // The red counts on the rail. The query SKIPS a queue that is not set to in-app, so
  // this is one cheap grouped count and nothing at all once support moves to email.
  const pending = await supportPendingCounts();
  const tenantName =
    acting.impersonating && acting.tenantId
      ? ((await prisma.tenant.findUnique({ where: { id: acting.tenantId }, select: { name: true } }))
          ?.name ?? "tenant")
      : null;

  return (
    <BuilderTabProvider>
      <div className="app-shell md:flex md:min-h-screen">
        <AdminSidebar
          user={{ name: user.name, email: user.email }}
          tenantName={tenantName}
          badges={{ "/admin/support": pending.SUPPORT, "/admin/onboarding": pending.ONBOARDING }}
        />
        {contained ? (
          <main className="min-w-0 flex-1">
            {tenantName ? <ImpersonationBanner tenantName={tenantName} /> : null}
            <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
            <AppFooter />
          </main>
        ) : (
          <div className="min-w-0 flex-1">
            {tenantName ? <ImpersonationBanner tenantName={tenantName} /> : null}
            {children}
            <AppFooter />
          </div>
        )}
      </div>
    </BuilderTabProvider>
  );
}
