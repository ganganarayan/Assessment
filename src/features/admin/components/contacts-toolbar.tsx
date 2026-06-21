"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Export (CSV/JSON dropdown) + Refresh for the Contacts page. Exports respect
 *  the active From/To range. Same Button theme as the rest of the app. */
export function ContactsToolbar({ from, to }: { from?: string; to?: string }) {
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

  const href = (format: "csv" | "json") => {
    const p = new URLSearchParams();
    p.set("format", format);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return `/api/admin/contacts/export?${p.toString()}`;
  };

  const itemClass =
    "block px-3 py-2 text-sm hover:bg-[var(--muted)] text-[var(--foreground)]";

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={wrapRef}>
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          Export
          <span className="ml-1 text-xs">▾</span>
        </Button>
        {open ? (
          <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-36 overflow-hidden rounded-md border bg-[var(--background)] shadow-lg">
            <a className={itemClass} href={href("csv")} onClick={() => setOpen(false)}>
              CSV
            </a>
            <a className={itemClass} href={href("json")} onClick={() => setOpen(false)}>
              JSON
            </a>
          </div>
        ) : null}
      </div>

      <Button
        size="sm"
        disabled={pending}
        onClick={() => start(() => router.refresh())}
      >
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
