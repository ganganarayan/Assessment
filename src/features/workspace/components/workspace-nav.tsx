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
      { href: "/w/result-pages", label: "Result pages" },
      { href: "/w/templates", label: "Templates (Assessment)" },
      { href: "/w/import", label: "Import assessment" },
    ],
  },
  {
    title: "Leads",
    items: [
      // Above the run-by-run lists on purpose: a person is the thing an owner looks
      // for, and the submissions below are what that person did.
      { href: "/w/contacts", label: "Contacts" },
      { href: "/w/submissions", label: "Submissions" },
      { href: "/w/gate-qualified", label: "Gate qualified" },
      { href: "/w/audiences", label: "Audiences" },
      { href: "/w/conversions", label: "Conversions" },
    ],
  },
  {
    // After Leads and before Analytics, because that is the order it happens in: a lead
    // qualifies, books a call, and the outcome of that call is the number worth reading.
    title: "Calendar",
    items: [
      { href: "/w/calendar", label: "Calendar", exact: true },
      { href: "/w/calendar/availability", label: "Availability" },
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
    // Everything that points at Meta. The ad account comes first because setting a
    // pixel is the first thing a new workspace does, and the tester is how you check
    // it. Same split as /admin: Automation was carrying seven unrelated items.
    title: "Ads",
    items: [
      { href: "/w/ad-accounts", label: "Ad accounts" },
      { href: "/w/pixel-test", label: "Pixel Tester" },
    ],
  },
  {
    // What fires on its own after a lead arrives, and nothing else.
    title: "Automation",
    items: [
      // First in the section: a trigger and its messages is the general shape, and
      // Nurture is the one-shot special case that predates it.
      { href: "/w/automations", label: "Automations" },
      // Above Nurture: a sequence is the thing most workspaces want, and the
      // one-shot below it is the special case of a sequence with one step.
      { href: "/w/workflows", label: "Workflows" },
      { href: "/w/nurture", label: "Nurture" },
      { href: "/w/webhooks", label: "Webhooks", exact: true },
      { href: "/w/webhooks/logs", label: "Webhook Logs" },
    ],
  },
  {
    // Two items and not one. A ticket is "something is broken" and onboarding is
    // "help me start", and a customer who cannot tell which one they are in writes
    // neither. They are also the two queues the owner can route separately.
    title: "Support",
    items: [
      { href: "/w/support", label: "Raise a ticket" },
      { href: "/w/onboarding", label: "Onboarding help" },
    ],
  },
  {
    title: "Account",
    items: [
      // Which provider and key this workspace generates with - a credential, like the
      // API tokens below. /admin has always kept AI here; this is the rail catching up.
      { href: "/w/ai", label: "AI" },
      // Shown only when the plan includes client workspaces (the layout hides it
      // otherwise). It lives in Account rather than Build because it is about who you
      // are running the tool for, not about the scorecards inside any one workspace.
      { href: "/w/agency-tenants", label: "Client workspaces" },
      { href: "/w/operations", label: "Operations" },
      { href: "/w/staff", label: "Staff" },
      // Who you are to our API. Not something that runs by itself.
      { href: "/w/api", label: "API tokens" },
      { href: "/w/billing", label: "Billing" },
      { href: "/w/settings", label: "Settings" },
    ],
  },
];

export function WorkspaceNav({
  hidden = [],
  badges = {},
  hardNav = false,
}: {
  hidden?: string[];
  /** href -> count, resolved on the server. Here it is only drawn. */
  badges?: Record<string, number>;
  /** The workspace is PARKED, so every link has to be a full page load. The lock is
   *  decided in the /w layout, and a layout does not re-render on a client navigation,
   *  so a soft link to /w/billing changed the URL and left the lock on screen. */
  hardNav?: boolean;
}) {
  const pathname = usePathname();
  const tab = useBuilderTab();
  const editing = isAssessmentEditor(pathname);

  const isActive = (it: NavItem) => (it.exact ? pathname === it.href : pathname.startsWith(it.href));

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items
      .filter((i) => !hidden.includes(i.href))
      .map((i) => (badges[i.href] ? { ...i, badge: badges[i.href] } : i)),
  })).filter((s) => s.items.length > 0);

  return (
    <NavShell
      sections={sections}
      isActive={isActive}
      storageKey="w"
      hardNav={hardNav}
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
