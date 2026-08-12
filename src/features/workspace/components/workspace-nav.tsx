"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  /** Match this exact path only (not startsWith) — for parent/child paths. */
  exact?: boolean;
}

const NAV: { section: string | null; items: NavItem[] }[] = [
  {
    section: null,
    items: [
      { href: "/w/assessments", label: "Assessments" },
      { href: "/w/import", label: "Import" },
      { href: "/w/submissions", label: "Submissions" },
    ],
  },
  {
    section: "Analytics",
    items: [
      { href: "/w/stats", label: "Stats" },
      { href: "/w/contacts", label: "Contacts" },
    ],
  },
  {
    section: "Automation",
    items: [
      { href: "/w/webhooks", label: "Webhooks", exact: true },
      { href: "/w/webhooks/logs", label: "Webhook Logs" },
      { href: "/w/api", label: "API tokens" },
    ],
  },
  {
    section: null,
    items: [
      { href: "/w/conversions", label: "Conversions" },
      { href: "/w/staff", label: "Staff" },
      { href: "/w/settings", label: "Settings" },
    ],
  },
];

export function WorkspaceNav() {
  const pathname = usePathname();
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
          {group.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "rounded-md px-2 py-1.5 hover:bg-[var(--muted)]",
                isActive(it) && "bg-[var(--muted)] font-medium",
              )}
            >
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
