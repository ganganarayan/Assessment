"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { withAdParams } from "@/lib/attribution-client";

/**
 * A call-to-action link that keeps the ad params on the URL.
 *
 * Every CTA on every marketing surface goes through this, so the funnel is entered
 * with the utm/click-id params the visitor arrived with rather than looking like
 * direct traffic.
 *
 * Progressive enhancement on purpose: the first render is the plain href, and the
 * params are added after mount from window.location. useSearchParams() would read
 * them during render instead, but it opts the whole page out of static rendering (or
 * demands a Suspense boundary around every button), and these pages are the ones that
 * most want to stay static. A click landing in the gap before hydration is still
 * attributed - middleware wrote the `a360_attr` cookie when the visitor landed, and
 * signup reads it from there.
 */
export function CtaLink({
  href,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const [resolved, setResolved] = useState(href);

  useEffect(() => {
    setResolved(withAdParams(href));
  }, [href]);

  return (
    // prefetch={false}: the funnel is a dynamic, per-tenant server render, and
    // prefetching it from every CTA on the page buys nothing but load.
    <Link href={resolved} className={className} prefetch={false} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
