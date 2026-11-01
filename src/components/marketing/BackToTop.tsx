"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

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

  if (!show) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="absolute right-4 top-full mt-2 flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-green-700 sm:right-8"
    >
      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
      Top
    </button>
  );
}
