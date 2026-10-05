import { ANSWERS, PAGES } from "./registry";
import { answerPath, seoPath } from "./urls";

export type SitemapEntry = {
  path: string;
  /** ISO date this page's CONTENT last materially changed. */
  updated: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
};

/**
 * The sitemap's contents as a PURE function, separate from the route that serves it.
 *
 * The route is gated to the platform host, which is correct - a customer's domain must not
 * publish our URL list - but it also means the sitemap is empty everywhere it can be
 * inspected before release. Pulling the list out here lets verify-seo assert that every
 * page and every answer is in it, instead of that first being observable in production.
 */
const STATIC_PAGES: ReadonlyArray<SitemapEntry> = [
  { path: "/", updated: "2026-10-02", changeFrequency: "weekly", priority: 1 },
  { path: "/sign-up", updated: "2026-10-01", changeFrequency: "monthly", priority: 0.6 },
  { path: "/answers", updated: "2026-10-02", changeFrequency: "weekly", priority: 0.6 },
  { path: "/contact", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.4 },
  { path: "/privacy", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.2 },
  { path: "/refund", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.2 },
  { path: "/shipping", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.2 },
  // /sign-in is NOT here, and is noindex on the page. It is a login box: nothing to rank,
  // nothing to answer, and every crawl of it is crawl budget spent on no one.
];

export function publicSitemapEntries(): SitemapEntry[] {
  return [
    ...STATIC_PAGES,
    // Content entries carry their OWN updatedAt, straight from the module that holds the
    // words. That is why lastmod can be trusted here: it changes when the text changes,
    // because it lives in the same file as the text.
    ...PAGES.map((p) => ({
      path: seoPath(p.slug),
      updated: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...ANSWERS.map((a) => ({
      path: answerPath(a.slug),
      updated: a.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
