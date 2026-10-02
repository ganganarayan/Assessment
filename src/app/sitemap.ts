import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { MARKETING } from "@/lib/marketing/content";
import { effectiveHost } from "@/lib/tenant/forwarded-host";
import { isPlatformHost } from "@/lib/seo/site";

/**
 * sitemap.xml — the public, indexable surface only.
 *
 * Tenant funnels (/a/<slug>) are deliberately absent: they belong to customers, they
 * come and go, and a tenant's ad landing page is not ours to publish.
 *
 * lastModified is a REAL date per page, hand-maintained beside the entry. It used to be
 * `new Date()` for every URL, which told Google that all seven pages changed on every
 * single crawl — a signal that is not merely useless but actively counter-productive,
 * because a sitemap whose lastmod is always "now" is a sitemap whose lastmod gets
 * ignored. Phase B derives these from the content modules; until there are content
 * modules, an honest constant beats a dishonest clock.
 *
 * Served on the platform host only. Every other host — tenant subdomains, custom
 * domains, staging, the raw Railway host — gets an empty but valid urlset, because
 * publishing assess360's URL list from a customer's domain would invite Google to treat
 * their domain as a duplicate of ours.
 */
type Entry = {
  path: string;
  /** ISO date this page's CONTENT last materially changed. */
  updated: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

const PAGES: ReadonlyArray<Entry> = [
  // Pricing and the capability list were rewritten with the Gate/Signal re-tier.
  { path: "/", updated: "2026-10-02", changeFrequency: "weekly", priority: 1 },
  { path: "/sign-up", updated: "2026-10-01", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.4 },
  { path: "/privacy", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.2 },
  { path: "/refund", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.2 },
  // Was missing entirely — the only public policy page not listed.
  { path: "/shipping", updated: "2026-09-01", changeFrequency: "yearly", priority: 0.2 },
  // /sign-in is NOT here, and is noindex on the page. It is a login box: nothing to
  // rank, nothing to answer, and every crawl of it is crawl budget spent on no one.
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isPlatformHost(effectiveHost(await headers()))) return [];

  return PAGES.map((p) => ({
    url: MARKETING.domain + p.path,
    lastModified: new Date(`${p.updated}T00:00:00Z`),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
