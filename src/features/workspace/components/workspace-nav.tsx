"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/w/assessments", label: "Assessments" },
  { href: "/w/contacts", label: "Contacts" },
  { href: "/w/webhooks", label: "Webhooks" },
];

export function WorkspaceNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {NAV.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "rounded-md px-2 py-1.5 hover:bg-[var(--muted)]",
            pathname.startsWith(i.href) && "bg-[var(--muted)] font-medium",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
