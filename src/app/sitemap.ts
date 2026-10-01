import type { MetadataRoute } from "next";
import { MARKETING } from "@/lib/marketing/content";

/**
 * sitemap.xml — the public, indexable surface only.
 *
 * Tenant funnels (/a/<slug>) are deliberately absent: they belong to customers, they
 * come and go, and a tenant's ad landing page is not ours to publish. Knowledge-base
 * articles get added here as they ship, since those are the pages built to be found.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = MARKETING.domain;
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/sign-up`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/sign-in`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/refund`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
