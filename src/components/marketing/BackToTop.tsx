"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A "Top" button that appears once the reader has scrolled past the first screen.
 * Rendered inside the sticky header and positioned off its bottom edge, so it always
 * sits just below the menu whatever height the offer bar wraps to.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const update = () => setShow(window.scrollY > 400);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  // Faded out rather than unmounted: removing the button while its own smooth scroll
  // was passing the threshold stopped the scroll part way up the page.
  return (
    <button
      type="button"
      aria-label="Back to top"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={(e) => {
        e.currentTarget.blur();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className={cn(
        "absolute right-4 top-full mt-2 flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-[opacity,background-color] hover:bg-green-700 sm:right-8",
        show ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
      Top
    </button>
  );
}
