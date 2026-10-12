import { requireWorkspace } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { ImpersonationBanner } from "@/features/admin/components/impersonation-banner";
import { WorkspaceNav } from "@/features/workspace/components/workspace-nav";
import { BuilderTabProvider } from "@/features/admin/components/builder-tab-context";
import { AppBrand } from "@/components/app-brand";
import { AppFooter } from "@/components/app-footer";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PlatformPixel } from "@/components/platform-pixel";
import { StartTrialReporter } from "@/features/billing/components/start-trial-reporter";
import { resolvePlatformMetaConfig } from "@/lib/settings/config";
import { resolvePlan } from "@/lib/billing/entitlements";
import { supportEmailFor } from "@/lib/billing/gate";
import { BillingBanner } from "@/features/billing/components/billing-banner";
import { WorkspaceLocked } from "@/features/billing/components/workspace-locked";
import { TrialWelcomeModal } from "@/features/billing/components/trial-welcome-modal";
import { SupportStrip } from "@/features/billing/components/support-strip";
import { headers } from "next/headers";
import { isStaff } from "@/lib/auth/guards";
import { resolveSupportRouting } from "@/lib/support/config";
import { tenantUnreadCounts } from "@/features/support/data";

/**
 * The tenant workspace shell. requireWorkspace resolves a CONCRETE acting tenant
 * (the tenant admin's own, or the one a super admin has entered). Only the pages
 * built under /w exist here, and each scopes its queries to that tenant - so no
 * unscoped page can leak another tenant's data.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, tenantId, impersonating } = await requireWorkspace();
  const [tenant, platformMeta, resolved, me] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, trialEndsAt: true } }),
    resolvePlatformMetaConfig(),
    resolvePlan(tenantId),
    // How many times this login has signed in, for the welcome dialog's "first five".
    // Read here rather than carried on the session: a session copy would be stale for
    // the whole of the visit it was created in, which is the one visit that matters.
    prisma.user.findUnique({ where: { id: user.id }, select: { loginCount: true } }),
  ]);

  // Hide what this plan cannot reach. The ROUTES are guarded independently - a hidden
  // link is presentation, never a permission - but offering a page that only says "not
  // on your plan" is a worse way to sell an upgrade than the billing page is.
  const hiddenNav = impersonating || resolved.limits.features.apiAccess ? [] : ["/w/api"];

  /**
   * The Support section, and the red count on it.
   *
   * 🔴 Owner only, matching the actions: read-only staff enforcement is not wired
   * across the app yet, and these threads carry the owner's replies about billing and
   * configuration. A hidden link is presentation and the actions refuse independently.
   *
   * A queue switched OFF keeps its link for a tenant who already has a thread open.
   * Hiding it would leave a conversation they were told to watch with no way back to
   * it, which is worse than an extra menu item.
   */
  const staff = isStaff(user);
  const routing = await resolveSupportRouting();
  const unread = staff ? { SUPPORT: 0, ONBOARDING: 0 } : await tenantUnreadCounts(tenantId);
  const hasOpen = { SUPPORT: unread.SUPPORT > 0, ONBOARDING: unread.ONBOARDING > 0 };
  if (staff) {
    hiddenNav.push("/w/support", "/w/onboarding");
  } else {
    if (routing.support === "OFF" && !hasOpen.SUPPORT) hiddenNav.push("/w/support");
    if (routing.onboarding === "OFF" && !hasOpen.ONBOARDING) hiddenNav.push("/w/onboarding");
  }
  const supportBadges = { "/w/support": unread.SUPPORT, "/w/onboarding": unread.ONBOARDING };

  /**
   * PARKED = locked, not read-only.
   *
   * The original design kept a parked workspace fully readable. The owner's decision
   * is the opposite: the account signs in, sees that everything is still there, and
   * can do nothing with it until a plan is picked. Billing is exempt because it is the
   * page that ends the lock, and the data export is exempt because the records belong
   * to the customer.
   *
   * Withheld on the SERVER - `children` is simply not rendered - so there is no class
   * to remove and no markup to read. The blur behind the panel is decoration.
   *
   * A super admin who has entered the workspace is never locked out of it: they are
   * operating it, not using it.
   */
  const path = (await headers()).get("x-pathname") ?? "";
  /**
   * Billing ends the lock, so it is exempt. SUPPORT is exempt for the same reason read
   * the other way round: a parked account is exactly the account most likely to need
   * help, and locking the only way they have of asking leaves a customer with a dead
   * screen and a reason to leave rather than to pay. The data export is already theirs
   * by the same argument.
   */
  const exemptWhileParked =
    path.startsWith("/w/billing") || path.startsWith("/w/support") || path.startsWith("/w/onboarding");
  const locked = resolved.parked && !impersonating && !exemptWhileParked;
  const supportEmail = locked ? await supportEmailFor(tenantId) : null;

  /**
   * The welcome dialog, and the strip under it.
   *
   * Trial holders only, and never while a super admin is operating the workspace: an
   * owner who has entered a customer's tenant to fix something is not the person that
   * offer is for, and a blocking dialog in front of support work is just an obstacle.
   *
   * Five logins, from the column stamped at sign-in. A brand new signup is on 1.
   */
  /**
   * Why the workspace is locked, when it is.
   *
   * `status` is the SUBSCRIPTION's status, so null means there never was one - and a
   * tenant that is parked without ever having subscribed got here by running out of
   * trial. A tenant whose subscription lapsed has a status and a different problem,
   * and telling them their trial expired would be wrong twice over.
   */
  const trialEnded = !!tenant?.trialEndsAt && tenant.trialEndsAt.getTime() <= Date.now();
  const lockReason: "trial-expired" | "parked" =
    resolved.status === null && trialEnded ? "trial-expired" : "parked";

  const onTrial = resolved.trialing && !impersonating;
  const loginCount = me?.loginCount ?? 1;
  const showWelcome = onTrial && loginCount <= 5;

  return (
    // The provider is what lets the sidebar switch the builder panels: the nav holds the
    // tabs, the editor page renders them, and both read the same React state so an
    // unsaved edit survives switching. Without it useBuilderTab() is null and the editor
    // silently shows only its first panel - which is why Results and VSL Result Page
    // existed in the workspace but could not be reached.
    <BuilderTabProvider>
    <div className="md:flex md:min-h-screen">
      <PlatformPixel pixelId={platformMeta.pixelId} />
      <StartTrialReporter />
      <aside className="shrink-0 border-b md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="px-2">
            <AppBrand href="/w" subtitle={tenant?.name ?? "Workspace"} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <WorkspaceNav hidden={hiddenNav} badges={supportBadges} />
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
        {/* The standing offer. Below the billing strip because "what state is my
            account in" has to be read before "who to call about it". */}
        {onTrial ? <SupportStrip /> : null}
        {/* Rendered last in the tree but painted over everything: it is fixed and
            z-100, so it covers the nav and the content alike. Nothing behind it is
            clickable while it is up, which is the point of it. */}
        {showWelcome ? (
          <TrialWelcomeModal loginCount={loginCount} trialDaysLeft={resolved.trialDaysLeft} />
        ) : null}
        <div className="flex justify-end px-4 pt-4 md:px-8">
          <ThemeToggle />
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-4 md:px-8">
          {locked ? <WorkspaceLocked supportEmail={supportEmail} reason={lockReason} /> : children}
        </div>
        <AppFooter />
      </main>
    </div>
    </BuilderTabProvider>
  );
}
