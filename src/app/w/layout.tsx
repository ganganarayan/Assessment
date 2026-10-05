import { requireWorkspace } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { ImpersonationBanner } from "@/features/admin/components/impersonation-banner";
import { WorkspaceNav } from "@/features/workspace/components/workspace-nav";
import { BuilderTabProvider } from "@/features/admin/components/builder-tab-context";
import { AppBrand } from "@/components/app-brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PlatformPixel } from "@/components/platform-pixel";
import { resolvePlatformMetaConfig } from "@/lib/settings/config";
import { resolvePlan } from "@/lib/billing/entitlements";
import { BillingBanner } from "@/features/billing/components/billing-banner";

/**
 * The tenant workspace shell. requireWorkspace resolves a CONCRETE acting tenant
 * (the tenant admin's own, or the one a super admin has entered). Only the pages
 * built under /w exist here, and each scopes its queries to that tenant - so no
 * unscoped page can leak another tenant's data.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, impersonating } = await requireWorkspace();
  const [tenant, platformMeta, resolved] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    resolvePlatformMetaConfig(),
    resolvePlan(tenantId),
  ]);

  return (
    // The provider is what lets the sidebar switch the builder panels: the nav holds the
    // tabs, the editor page renders them, and both read the same React state so an
    // unsaved edit survives switching. Without it useBuilderTab() is null and the editor
    // silently shows only its first panel - which is why Results and VSL Result Page
    // existed in the workspace but could not be reached.
    <BuilderTabProvider>
    <div className="md:flex md:min-h-screen">
      <PlatformPixel pixelId={platformMeta.pixelId} />
      <aside className="shrink-0 border-b md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="px-2">
            <AppBrand href="/w" subtitle={tenant?.name ?? "Workspace"} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <WorkspaceNav />
          </div>
          <div className="mt-auto">
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {impersonating && tenant ? <ImpersonationBanner tenantName={tenant.name} /> : null}
        {/* Below the impersonation strip on purpose: when an owner enters a parked
            tenant, "who am I acting as" has to be read before "what state is it in",
            or the paused notice looks like the owner's own account. */}
        <BillingBanner resolved={resolved} />
        <div className="flex justify-end px-4 pt-4 md:px-8">
          <ThemeToggle />
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-4 md:px-8">{children}</div>
      </main>
    </div>
    </BuilderTabProvider>
  );
}
