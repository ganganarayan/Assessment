"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NavShell, type NavItem, type NavSection } from "@/components/nav-shell";
import { useBuilderTab, BUILDER_TABS } from "@/features/admin/components/builder-tab-context";

const BUILDER_HREF = "/w/assessments";

/** True on an assessment editor page (/w/assessments/<id>), not the list or /new. */
function isAssessmentEditor(pathname: string) {
  return /^\/w\/assessments\/[^/]+$/.test(pathname) && !pathname.endsWith("/new");
}

/**
 * The workspace rail.
 *
 * Every section is named now. They were four runs of links with two headings between
 * them, which is a list, not a menu - and the builder's twelve steps hang off one of
 * those links, so the column was long before anybody added anything to it.
 */
const SECTIONS: NavSection[] = [
  {
    // Dashboard is where a tenant LANDS, not something they build. Under Build it
    // read as the first step of the work rather than the view of its results.
    title: "Overview",
    items: [{ href: "/w/dashboard", label: "Dashboard" }],
  },
  {
    title: "Build",
    items: [
      { href: "/w/assessments", label: "Assessments" },
      { href: "/w/templates", label: "Templates" },
      { href: "/w/import", label: "Import" },
    ],
  },
  {
    title: "Leads",
    items: [
      { href: "/w/submissions", label: "Submissions" },
      { href: "/w/audiences", label: "Audiences" },
      { href: "/w/conversions", label: "Conversions" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { href: "/w/stats", label: "Stats" },
      { href: "/w/data-window", label: "Data window" },
    ],
  },
  {
    title: "Automation",
    items: [
      { href: "/w/webhooks", label: "Webhooks", exact: true },
      { href: "/w/webhooks/logs", label: "Webhook Logs" },
      { href: "/w/nurture", label: "Nurture" },
      { href: "/w/pixel-test", label: "Pixel Tester" },
      { href: "/w/api", label: "API tokens" },
      { href: "/w/ai", label: "AI" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/w/operations", label: "Operations" },
      { href: "/w/staff", label: "Staff" },
      { href: "/w/billing", label: "Billing" },
      { href: "/w/settings", label: "Settings" },
    ],
  },
];

export function WorkspaceNav({ hidden = [] }: { hidden?: string[] }) {
  const pathname = usePathname();
  const tab = useBuilderTab();
  const editing = isAssessmentEditor(pathname);

  const isActive = (it: NavItem) => (it.exact ? pathname === it.href : pathname.startsWith(it.href));

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !hidden.includes(i.href)),
  })).filter((s) => s.items.length > 0);

  return (
    <NavShell
      sections={sections}
      isActive={isActive}
      storageKey="w"
      renderUnder={(it) =>
        // While editing an assessment, the builder's STEPS branch off Assessments -
        // the same place /admin puts them. This branch is the only way to reach them.
        it.href === BUILDER_HREF && editing ? (
          <div className="mt-1 ml-3 flex flex-col gap-1 border-l pl-2">
            {BUILDER_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => tab?.setActive(t.key)}
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
  );
}
