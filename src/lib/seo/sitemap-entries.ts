import { ANSWERS, PAGES } from "./registry";
import { publishedCaseStudies } from "@/content/case-studies";
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
  { path: "/", updated: "2026-10-09", changeFrequency: "weekly", priority: 1 },
  // The done-for-you intake, and the home page's primary call to action. Ranked above
  // /sign-up deliberately: it is the conversion the site is currently built around, and
  // "done for you" is a search intent of its own that a trial page cannot answer.
  { path: "/build", updated: "2026-10-09", changeFrequency: "monthly", priority: 0.9 },
  // Ungated, answers a question people actually type ("what does a bad sales call
  // cost"), and asks for nothing. It is the cheapest entry point on the site.
  { path: "/wasted-call-calculator", updated: "2026-10-09", changeFrequency: "monthly", priority: 0.8 },
  // The two By-industry pages: where an emailed funnel audit lands, and the only
  // pages that argue the mechanism in one industry's own words. Ranked with /build
  // rather than with the keyword pages, because they are campaign destinations.
  { path: "/industries/study-abroad", updated: "2026-10-09", changeFrequency: "monthly", priority: 0.9 },
  { path: "/industries/clinics", updated: "2026-10-09", changeFrequency: "monthly", priority: 0.9 },
  { path: "/sign-up", updated: "2026-10-01", changeFrequency: "monthly", priority: 0.6 },
  { path: "/pricing", updated: "2026-10-06", changeFrequency: "monthly", priority: 0.8 },
  // The Agency tier advertises API access, so the docs have to be findable without
  // being in the nav - an integration question is a search, not a browse.
  { path: "/api-docs", updated: "2026-10-09", changeFrequency: "monthly", priority: 0.5 },
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
    // Case studies, DERIVED from what is actually published. The index itself is only
    // listed once there is something on it, because the page 404s until then and a
    // sitemap advertising a 404 is a crawl budget spent on nothing.
    ...(publishedCaseStudies().length > 0
      ? [
          {
            path: "/case-studies",
            updated: publishedCaseStudies()[0]!.updatedAt,
            changeFrequency: "monthly" as const,
            priority: 0.7,
          },
        ]
      : []),
    ...publishedCaseStudies().map((c) => ({
      path: `/case-studies/${c.slug}`,
      updated: c.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
