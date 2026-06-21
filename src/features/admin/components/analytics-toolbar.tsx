"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface ExportItem {
  label: string;
  href: string;
}
export interface ExportGroup {
  label?: string;
  items: ExportItem[];
}

/** Export (grouped CSV/JSON dropdown) + Refresh, shared by the analytics pages.
 *  hrefs are built by the page (so they carry the active date range). Primary
 *  green Buttons to match the app theme. */
export function AnalyticsToolbar({ exportGroups }: { exportGroups: ExportGroup[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = "block px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]";

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={wrapRef}>
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          Export
          <span className="ml-1 text-xs">▾</span>
        </Button>
        {open ? (
          <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-52 overflow-hidden rounded-md border bg-[var(--background)] py-1 shadow-lg">
            {exportGroups.map((g, gi) => (
              <div key={g.label ?? `group-${gi}`} className={gi > 0 ? "border-t" : ""}>
                {g.label ? (
                  <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    {g.label}
                  </div>
                ) : null}
                {g.items.map((it) => (
                  <a key={it.href} className={itemClass} href={it.href} onClick={() => setOpen(false)}>
                    {it.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Button size="sm" disabled={pending} onClick={() => start(() => router.refresh())}>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={pending ? "animate-spin" : ""}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        {pending ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}
