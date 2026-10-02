import { MARKETING } from "@/lib/marketing/content";

/**
 * Public URL shapes, in one place and deliberately free of server-only imports so that
 * both the renderers and the client components can use them.
 *
 * Pillars live at the root (/lead-qualification-software) because the slug IS the head
 * term, and burying a head term under a folder throws away the clearest signal a URL can
 * carry. Knowledge-base answers live under /answers/ because they are a set, they need an
 * index, and the prefix is what a person reads before they read the slug.
 */
export const ANSWERS_BASE = "/answers";

export const seoPath = (slug: string) => `/${slug}`;
export const answerPath = (slug: string) => `${ANSWERS_BASE}/${slug}`;

export const absolute = (path: string) => MARKETING.domain + path;
export const seoUrl = (slug: string) => absolute(seoPath(slug));
export const answerUrl = (slug: string) => absolute(answerPath(slug));

/** The one host the public, indexable site lives on. */
export const PLATFORM_HOST = new URL(MARKETING.domain).host;

/**
 * Is this request on the platform's own public host?
 *
 * Deliberately an exact match rather than "is this NOT a tenant", because the question
 * being asked is "are the URLs in our sitemap the URLs of the host being served". A
 * tenant subdomain, a custom domain, the raw Railway host and the staging host are all
 * correctly "no": none of them should advertise the production sitemap as theirs.
 *
 * Pure and exported so it can be asserted without a running server.
 */
export function isPlatformHost(host: string): boolean {
  return host.toLowerCase() === PLATFORM_HOST;
}
