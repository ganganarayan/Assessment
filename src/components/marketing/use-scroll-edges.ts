"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Whether a sideways-scrolling element has more to show on each side. A swipe-only row
 * gives no sign that anything is out of view, so callers draw an arrow per side from
 * these two flags and scroll with `scrollBy`.
 */
export function useScrollEdges<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  back: boolean;
  more: boolean;
  scrollBy: (dx: number) => void;
} {
  const ref = useRef<T>(null);
  const [back, setBack] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
      setBack(el.scrollLeft > 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return {
    ref,
    back,
    more,
    scrollBy: (dx) => ref.current?.scrollBy({ left: dx, behavior: "smooth" }),
  };
}
