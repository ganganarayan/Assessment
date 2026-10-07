"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useBuilderTab, BUILDER_TABS } from "@/features/admin/components/builder-tab-context";

const BUILDER_HREF = "/w/assessments";

/** True on an assessment editor page (/w/assessments/<id>), not the list or /new. */
function isAssessmentEditor(pathname: string) {
  return /^\/w\/assessments\/[^/]+$/.test(pathname) && !pathname.endsWith("/new");
}

interface NavItem {
  href: string;
  label: string;
  /** Match this exact path only (not startsWith) - for parent/child paths. */
  exact?: boolean;
}

const NAV: { section: string | null; items: NavItem[] }[] = [
  {
    section: null,
    items: [
      { href: "/w/dashboard", label: "Dashboard" },
      { href: "/w/assessments", label: "Assessments" },
      { href: "/w/import", label: "Import" },
      { href: "/w/submissions", label: "Submissions" },
      { href: "/w/audiences", label: "Audiences" },
      { href: "/w/ai", label: "AI" },
    ],
  },
  {
    section: "Analytics",
    items: [
      { href: "/w/stats", label: "Stats" },
      { href: "/w/data-window", label: "Data window" },
    ],
  },
  {
    section: "Automation",
    items: [
      { href: "/w/webhooks", label: "Webhooks", exact: true },
      { href: "/w/webhooks/logs", label: "Webhook Logs" },
      { href: "/w/nurture", label: "Nurture" },
      { href: "/w/pixel-test", label: "Pixel Tester" },
      { href: "/w/api", label: "API tokens" },
    ],
  },
  {
    section: null,
    items: [
      { href: "/w/conversions", label: "Conversions" },
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
  const isActive = (it: NavItem) =>
    it.exact ? pathname === it.href : pathname.startsWith(it.href);

  return (
    <nav className="flex flex-col gap-4 text-sm">
      {NAV.map((group, i) => (
        <div key={i} className="flex flex-col gap-1">
          {group.section ? (
            <p className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {group.section}
            </p>
          ) : null}
          {group.items.filter((it) => !hidden.includes(it.href)).map((it) => (
            <div key={it.href} className="flex flex-col">
              <Link
                href={it.href}
                className={cn(
                  "rounded-md px-2 py-1.5 hover:bg-[var(--muted)]",
                  isActive(it) && "bg-[var(--muted)] font-medium",
                )}
              >
                {it.label}
              </Link>
              {/* While editing an assessment, the builder's panels are switched from
                  here, as a branch under Assessments - the same place /admin puts them.
                  Without this branch the workspace rendered all three panels but showed
                  only the first: BuilderTabPanels falls back to tabs[0] when no tab is
                  active, so Results and VSL Result Page existed and were unreachable. */}
              {it.href === BUILDER_HREF && editing ? (
                <div className="mt-1 ml-3 flex flex-col gap-1 border-l pl-2">
                  {BUILDER_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => tab?.setActive(t.key)}
                      className={cn(
                        "rounded-md px-2 py-1 text-left text-sm hover:bg-[var(--muted)]",
                        (tab?.active ?? "assessment") === t.key && "bg-[var(--muted)] font-medium",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}
