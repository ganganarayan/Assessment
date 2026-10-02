import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { MARKETING } from "@/lib/marketing/content";
import { effectiveHost } from "@/lib/tenant/forwarded-host";
import { isPlatformHost } from "@/lib/seo/urls";
import { publicSitemapEntries } from "@/lib/seo/sitemap-entries";

/**
 * sitemap.xml — the public, indexable surface only.
 *
 * Tenant funnels (/a/<slug>) are deliberately absent: they belong to customers, they come
 * and go, and a tenant's ad landing page is not ours to publish.
 *
 * ONE sitemap, not a sitemap index. The protocol's limit is 50,000 URLs per file and the
 * content here will not approach a thousand; an index wrapping a single child adds a hop
 * for crawlers and a file for us in exchange for nothing. Revisit if that changes.
 *
 * Served on the platform host only. Every other host — tenant subdomains, custom domains,
 * staging, the raw Railway host — gets an empty but valid urlset, because publishing
 * assess360's URL list from a customer's domain would invite Google to treat their domain
 * as a duplicate of ours. The contents live in lib/seo/sitemap-entries so they can be
 * asserted by verify-seo rather than first observed in production.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isPlatformHost(effectiveHost(await headers()))) return [];

  return publicSitemapEntries().map((e) => ({
    url: MARKETING.domain + e.path,
    lastModified: new Date(`${e.updated}T00:00:00Z`),
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
}
