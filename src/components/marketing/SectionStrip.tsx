"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollEdges } from "./use-scroll-edges";

export type StripItem = {
  label: string;
  href: string;
  /** Breakpoint classes for items that only belong in the strip on small screens. */
  className?: string;
};

/**
 * The header's second row. It scrolls sideways when the links do not fit, and a
 * swipe-only row gives no sign that there is more, so an arrow shows on each side
 * while anything is still out of view that way: it fades the edge, scrolls on tap,
 * and goes away at that end of the row.
 */
export function SectionStrip({ items }: { items: ReadonlyArray<StripItem> }) {
  const { ref, back, more, scrollBy } = useScrollEdges<HTMLUListElement>();

  const linkClass =
    "text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]";

  return (
    <nav aria-label="Sections" className="relative mx-auto max-w-6xl">
      <ul
        ref={ref}
        className="flex items-center gap-x-6 overflow-x-auto whitespace-nowrap px-5 pb-2.5 [scrollbar-width:none] sm:px-8 lg:justify-center [&::-webkit-scrollbar]:hidden"
      >
        {items.map((l) => (
          <li key={l.href} className={cn("shrink-0", l.className)}>
            {l.href.startsWith("/") ? (
              <Link href={l.href} className={linkClass}>
                {l.label}
              </Link>
            ) : (
              <a href={l.href} className={linkClass}>
                {l.label}
              </a>
            )}
          </li>
        ))}
        {/* Room for the arrow, so the last link can scroll fully clear of it. */}
        <li aria-hidden="true" className="w-6 shrink-0" />
      </ul>
      {back ? (
        <button
          type="button"
          aria-label="Scroll the section links left"
          onClick={() => scrollBy(-200)}
          className="absolute inset-y-0 left-0 flex items-start bg-gradient-to-r from-[var(--background)] from-50% to-transparent pl-2 pr-6 text-[var(--foreground)]"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : null}
      {more ? (
        <button
          type="button"
          aria-label="Scroll the section links right"
          onClick={() => scrollBy(200)}
          className="absolute inset-y-0 right-0 flex items-start bg-gradient-to-l from-[var(--background)] from-50% to-transparent pl-6 pr-2 text-[var(--foreground)]"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : null}
    </nav>
  );
}
