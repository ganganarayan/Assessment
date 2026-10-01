import type { MetadataRoute } from "next";
import { MARKETING } from "@/lib/marketing/content";

/**
 * robots.txt.
 *
 * AI answer engines are a real acquisition channel for a tool like this: people ask
 * "how do I stop Meta sending junk leads" long before they search a product name. Those
 * crawlers are named explicitly rather than left to the wildcard, because several of
 * them (GPTBot, CCBot) are commonly blocked by default templates and by some hosts —
 * naming them is a statement of intent that survives someone copying a stricter
 * boilerplate over this file.
 *
 * Google-Extended governs whether content may inform Gemini answers; it is not a
 * crawler and does not affect Search ranking either way.
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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/", disallow: PRIVATE_PATHS })),
    ],
    sitemap: `${MARKETING.domain}/sitemap.xml`,
    host: MARKETING.domain,
  };
}
