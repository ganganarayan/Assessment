"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { useBuilderTab, BUILDER_TABS } from "@/features/admin/components/builder-tab-context";
import { AppBrand } from "@/components/app-brand";
import { NavShell, type NavItem, type NavSection } from "@/components/nav-shell";

const BUILDER_HREF = "/admin/assessment-builder";
/** True on an assessment editor page (/admin/assessments/<id>, not the list/new). */
function isAssessmentEditor(pathname: string) {
  return /^\/admin\/assessments\/[^/]+$/.test(pathname) && !pathname.endsWith("/new");
}

interface AdminSidebarProps {
  user: { name: string; email: string };
  /** The tenant a super admin has entered, shown under the wordmark. Null = platform. */
  tenantName?: string | null;
}

/**
 * The owner's rail, in named sections.
 *
 * It was five unlabelled runs of links with two headings among them - which is a list
 * rather than a menu, and the builder's twelve steps hang off one of those links. Named
 * and folded, the thing you want is never more than one click from the top of the
 * column.
 */
const SECTIONS: NavSection[] = [
  {
    title: "Platform",
    items: [
      { href: "/platform", label: "Tenants", exact: true },
      { href: "/platform/stats", label: "Marketing stats" },
      // The done-for-you queue. Under Platform rather than Leads: these are applicants
      // to the offer, not respondents to anybody's funnel.
      { href: "/admin/build-requests", label: "Build requests" },
    ],
  },
  {
    // Dashboard is not something a tenant BUILDS - it is where they land and read
    // what the building produced. Filed under Build it read as a step of the work.
    title: "Overview",
    items: [{ href: "/admin", label: "Dashboard", exact: true }],
  },
  {
    title: "Build",
    items: [
      { href: "/admin/assessment-builder", label: "Assessment Builder" },
      { href: "/admin/assessments", label: "Assessments", exact: true },
      { href: "/admin/templates", label: "Templates" },
      { href: "/admin/import", label: "Import" },
    ],
  },
  {
    title: "Leads",
    items: [
      { href: "/admin/submissions", label: "Submissions" },
      { href: "/admin/audiences", label: "Audiences" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { href: "/admin/analytics/stats", label: "Stats" },
      { href: "/admin/data-window", label: "Data window" },
    ],
  },
  {
    title: "Automation",
    items: [
      { href: "/admin/nurture", label: "Nurture" },
      { href: "/admin/webhooks", label: "Webhooks", exact: true },
      { href: "/admin/webhook-logs", label: "Webhook Logs" },
      { href: "/admin/pixel-test", label: "Pixel Tester" },
      { href: "/admin/api-tokens", label: "API Tokens" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/admin/ai", label: "AI" },
      { href: "/admin/operations", label: "Operations" },
      { href: "/admin/staff", label: "Staff" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

export function AdminSidebar({ user, tenantName }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tab = useBuilderTab();
  const editing = isAssessmentEditor(pathname);

  const isActive = (it: NavItem) => {
    // The editor and /new live under /admin/assessments/* and belong to the builder,
    // so the builder link owns them and the list link is its exact path only.
    if (it.href === BUILDER_HREF) {
      return pathname.startsWith(BUILDER_HREF) || pathname.startsWith("/admin/assessments/");
    }
    return it.exact ? pathname === it.href : pathname.startsWith(it.href);
  };

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-3 md:hidden">
        <AppBrand href="/admin" subtitle={tenantName ?? null} />
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          Menu
        </Button>
      </div>

      <aside
        className={cn(
          "shrink-0 border-b md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r",
          open ? "block" : "hidden md:block",
        )}
      >
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="hidden px-2 md:block">
            <AppBrand href="/admin" subtitle={tenantName ?? null} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NavShell
              sections={SECTIONS}
              isActive={isActive}
              storageKey="admin"
              renderUnder={(it) =>
                // While editing an assessment, the builder's steps live here as a
                // branch under Assessment Builder.
                it.href === BUILDER_HREF && editing ? (
                  <div className="mt-1 ml-3 flex flex-col gap-1 border-l pl-2">
                    {BUILDER_TABS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          tab?.setActive(t.key);
                          setOpen(false);
                        }}
                        className={cn(
                          "rounded-md px-2 py-1 text-left text-sm hover:bg-[var(--muted)]",
                          (tab?.active ?? "basics") === t.key && "bg-[var(--muted)] font-medium",
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                ) : null
              }
            />
          </div>
          <div className="border-t pt-3">
            <div className="mb-3 px-2">
              <p className="truncate text-sm font-medium" title={user.name}>
                {user.name}
              </p>
              <p className="truncate text-xs text-[var(--muted-foreground)]" title={user.email}>
                {user.email}
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
