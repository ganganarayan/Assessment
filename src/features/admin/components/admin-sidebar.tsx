"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

interface NavItem {
  href: string;
  label: string;
}
const NAV: { section: string | null; items: NavItem[] }[] = [
  { section: null, items: [{ href: "/admin", label: "Dashboard" }] },
  {
    section: null,
    items: [
      { href: "/admin/assessments", label: "Assessments" },
      { href: "/admin/submissions", label: "Submissions" },
    ],
  },
  {
    section: "Automation",
    items: [
      { href: "/admin/events", label: "Events" },
      { href: "/admin/webhooks", label: "Webhooks" },
      { href: "/admin/webhook-logs", label: "Webhook Logs" },
    ],
  },
  { section: null, items: [{ href: "/admin/settings", label: "Settings" }] },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-3 md:hidden">
        <Link href="/admin" className="font-semibold">
          Assess360
        </Link>
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
          <Link href="/admin" className="hidden px-2 text-lg font-semibold md:block">
            Assess360
          </Link>
          <nav className="flex flex-1 flex-col gap-4 text-sm">
            {NAV.map((group, i) => (
              <div key={i} className="flex flex-col gap-1">
                {group.section ? (
                  <p className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    {group.section}
                  </p>
                ) : null}
                {group.items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-md px-2 py-1.5 hover:bg-[var(--muted)]",
                      isActive(it.href) && "bg-[var(--muted)] font-medium",
                    )}
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="border-t pt-3">
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
