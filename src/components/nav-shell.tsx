"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The signed-in navigation: sections that open one at a time, and a column that folds
 * away entirely.
 *
 * WHY. The admin rail had grown to twenty-odd links in five unlabelled runs, and the
 * builder added ten more underneath one of them. Everything was visible, which sounds
 * generous and is not: a list long enough to scroll is a list nobody reads, and the
 * thing somebody needs is always below the fold.
 *
 * ONE SECTION AT A TIME, deliberately. Letting several stand open returns it to the
 * long list it already was within a week of use - and the accordion is what keeps the
 * section you are working in at the top of the column, where it can be read without
 * scrolling.
 *
 * WHICH ONE OPENS. The section holding the page you are on, worked out from the path.
 * Opening the first one, or the last one you touched, would mean arriving somewhere and
 * not being able to see where you are.
 *
 * Shared by /admin and /w. They are different link sets and the same behaviour, and
 * two copies of an accordion is two copies to fix.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Match this exact path only - for a parent that has children. */
  exact?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export function NavShell({
  sections,
  isActive,
  renderUnder,
  storageKey,
}: {
  sections: NavSection[];
  /** Whether an item is the current page. Each app has its own matching rules. */
  isActive: (item: NavItem) => boolean;
  /** Extra content under a given item - the builder's step list hangs off one link. */
  renderUnder?: (item: NavItem) => ReactNode;
  /** Remembers the column's folded state per app. */
  storageKey: string;
}) {
  const activeSection = sections.find((s) => s.items.some((i) => isActive(i)))?.title ?? null;
  const [open, setOpen] = useState<string | null>(activeSection ?? sections[0]?.title ?? null);
  const [folded, setFolded] = useState(false);

  // Follow the route. Navigating into a section has to open it, or you land on a page
  // whose own section is shut and the rail says nothing about where you are.
  useEffect(() => {
    if (activeSection) setOpen(activeSection);
  }, [activeSection]);

  useEffect(() => {
    try {
      setFolded(window.localStorage.getItem(`nav.folded.${storageKey}`) === "1");
    } catch {
      // Blocked storage is not a reason to hide the navigation.
    }
  }, [storageKey]);

  function toggleFold() {
    setFolded((f) => {
      const nextVal = !f;
      try {
        window.localStorage.setItem(`nav.folded.${storageKey}`, nextVal ? "1" : "0");
      } catch {
        // Not remembering it is survivable; refusing to fold is not.
      }
      return nextVal;
    });
  }

  if (folded) {
    return (
      <div className="flex items-start justify-center p-2">
        <button
          type="button"
          onClick={toggleFold}
          aria-label="Show the menu"
          title="Show the menu"
          className="rounded-md border px-2 py-1 text-sm hover:bg-[var(--muted)]"
        >
          »
        </button>
      </div>
    );
  }

  return (
    <nav className="flex flex-col gap-1 text-sm">
      <div className="flex justify-end px-1 pb-1">
        <button
          type="button"
          onClick={toggleFold}
          aria-label="Hide the menu"
          title="Hide the menu"
          className="rounded-md border px-2 py-0.5 text-xs hover:bg-[var(--muted)]"
        >
          «
        </button>
      </div>

      {sections.map((section) => {
        const isOpen = open === section.title;
        const holdsActive = section.items.some((i) => isActive(i));
        return (
          <div key={section.title} className="flex flex-col">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : section.title)}
              aria-expanded={isOpen}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide hover:bg-[var(--muted)]",
                holdsActive ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]",
              )}
            >
              <span>{section.title}</span>
              {/* Right-pointing is shut, down-pointing is open - at the END of the
                  title, which is where the eye lands last and where it does not push
                  the words around as it turns. */}
              <span aria-hidden className="ml-2 text-[10px] leading-none">
                {isOpen ? "▼" : "▶"}
              </span>
            </button>

            {isOpen ? (
              <div className="mb-1 ml-1 flex flex-col gap-0.5 border-l pl-2">
                {section.items.map((item) => (
                  <div key={item.href} className="flex flex-col">
                    <Link
                      href={item.href}
                      className={cn(
                        "rounded-md px-2 py-1.5 hover:bg-[var(--muted)]",
                        isActive(item) && "bg-[var(--muted)] font-medium",
                      )}
                    >
                      {item.label}
                    </Link>
                    {renderUnder?.(item)}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
