"use client";

import { type ReactNode } from "react";
import { useBuilderTab } from "@/features/admin/components/builder-tab-context";

/**
 * Renders the Assessment Builder panels full-width (the tab switcher itself lives
 * in the main sidebar). All panels stay mounted (inactive hidden via CSS) so an
 * unsaved edit in one survives switching to another.
 */
export function BuilderTabPanels({
  tabs,
}: {
  tabs: { key: string; content: ReactNode }[];
}) {
  const ctx = useBuilderTab();
  // Fall back to the first tab if the shared active key isn't one of ours, so the
  // content area is never blank.
  const active = tabs.some((t) => t.key === ctx?.active) ? (ctx?.active ?? "") : (tabs[0]?.key ?? "");
  return (
    <div className="min-w-0">
      {tabs.map((t) => (
        <div key={t.key} className={active === t.key ? "flex flex-col gap-8" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
