import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { MARKETING } from "@/lib/marketing/content";
import { effectiveHost } from "@/lib/tenant/forwarded-host";
import { isPlatformHost } from "@/lib/seo/urls";

/**
 * robots.txt.
 *
 * AI answer engines are a real acquisition channel for a tool like this: people ask
 * "how do I stop Meta sending junk leads" long before they search a product name. Those
 * crawlers are named explicitly rather than left to the wildcard, because several of
 * them (GPTBot, CCBot) are commonly blocked by default templates and by some hosts -
 * naming them is a statement of intent that survives someone copying a stricter
 * boilerplate over this file.
 *
 * Google-Extended governs whether content may inform Gemini answers; it is not a
 * crawler and does not affect Search ranking either way.
 *
 * HOST-AWARE, because this route answers on every host the app serves: the platform
 * domain, every tenant subdomain, every tenant custom domain, staging and the raw
 * Railway host. Only the platform's own host may advertise the sitemap - the sitemap
 * lists assess360 URLs, and a customer's domain telling Google "my sitemap is over
 * there" is both wrong and a little rude.
 *
 * What this deliberately does NOT do on a tenant host is `Disallow: /`. It would look
 * tidy and it would break the product: facebookexternalhit honours robots.txt when it
 * builds a link preview, and these funnels are ad landing pages shared on Facebook,
 * Instagram and WhatsApp. Blocking the crawler blocks the preview card. Duplicate
 * content is handled where it belongs - a canonical on the page - which costs no
 * previews.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
  "meta-externalagent",
];

/** Signed-in surfaces: nothing to index, and no reason to spend crawl budget there. */
const PRIVATE_PATHS = ["/admin", "/w", "/dashboard", "/api", "/platform", "/r/", "/e/", "/change-password"];

/**
 * A non-production Railway environment (staging) must not be crawled at all. It serves the
 * entire marketing site, and while every page canonicals to production - which is what has
 * kept this from being a live problem - "mostly consolidated" is not the same as "not
 * indexed".
 *
 * Written so that an ABSENT variable means production. Railway injects this name; if it
 * ever stops, the failure mode is "production keeps being crawlable", not "production
 * silently delists itself".
 */
function isNonProductionEnvironment(): boolean {
  const name = process.env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase();
  return Boolean(name) && name !== "production";
}

/**
 * The rule set, pure and exported, so verify-seo can assert that the AI crawlers are still
 * named and the signed-in surfaces are still excluded. Staging now answers Disallow: /,
 * which is right and also means these rules can no longer be read off a running
 * environment before release.
 */
export function publicRobotsRules() {
  return [
    { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/", disallow: PRIVATE_PATHS })),
  ];
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (isNonProductionEnvironment()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  const rules = publicRobotsRules();

  if (!isPlatformHost(effectiveHost(await headers()))) return { rules };

  return { rules, sitemap: `${MARKETING.domain}/sitemap.xml`, host: MARKETING.domain };
}
