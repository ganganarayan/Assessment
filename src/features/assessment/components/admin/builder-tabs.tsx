"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Left-rail tabs for the Assessment Builder (e.g. Assessment | Results). All tab
 * content stays mounted (inactive hidden via CSS) so unsaved edits in one tab
 * survive switching to another.
 */
export function BuilderTabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <nav className="flex gap-2 overflow-x-auto md:w-52 md:shrink-0 md:flex-col md:overflow-visible">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-2 text-left text-sm hover:bg-[var(--muted)]",
              active === t.key && "bg-[var(--muted)] font-medium",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {tabs.map((t) => (
          <div key={t.key} className={active === t.key ? "flex flex-col gap-8" : "hidden"}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
