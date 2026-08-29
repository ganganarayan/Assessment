/**
 * Confident non-human user-agents: search + AI crawlers, headless browsers, and
 * raw HTTP libraries. Kept deliberately TIGHT — real browser UAs (Chrome, Safari,
 * Firefox, Edge, mobile webviews) never contain these tokens, so a match is a safe
 * signal to refuse a lead opt-in without risking a real respondent.
 *
 * Note: this catches HONEST bots (which send a real bot UA). Scripted bots that
 * spoof a browser UA are caught by the form honeypot instead.
 */
const CRAWLER_RE =
  /(?:bot\b|bot\/|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|slackbot|telegrambot|discordbot|pinterestbot|headless|phantomjs|puppeteer|playwright|python-requests|python-urllib|go-http-client|okhttp|libwww|curl\/|wget\/|scrapy|httpclient|node-fetch|axios\/|java\/)/i;

export function isCrawlerUserAgent(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim();
  if (!s) return false; // absent UA is ambiguous — don't block a real opt-in on it
  return CRAWLER_RE.test(s);
}

/**
 * Broader bot flag for ANALYTICS attribution (distinct from isCrawlerUserAgent,
 * which gates opt-ins). Why separate: the opt-in page view fires from a client
 * beacon, so only JS-capable clients trip it. Meta's ad-review renderer and
 * link-preview crawlers DO run JS but fetch the bare landing URL with no UTM — so
 * they land as sourceless "—" views that inflate traffic on every ad launch. We
 * still RECORD these hits (for audit, and so the discrepancy is explainable) but
 * flag them, so every human-facing metric can exclude them.
 *
 * Differences from isCrawlerUserAgent:
 *  - includes search bots (googlebot, bingbot, …) and SEO/monitoring crawlers,
 *    which are irrelevant to opt-ins but still pollute traffic counts;
 *  - treats a MISSING UA as a bot (a real browser always sends one), since here a
 *    false exclusion only drops a metric, never blocks a respondent.
 * Still conservative on real in-app browsers (Instagram/Facebook/WhatsApp are NOT
 * matched), so genuine visitors are never miscounted as bots.
 */
const BOT_UA = new RegExp(
  [
    // Meta / Facebook (the ad-review + preview agents behind the blank views)
    "facebookexternalhit",
    "meta-externalagent",
    "facebookcatalog",
    "facebot",
    // Other social / chat link-preview unfurlers (pure fetchers, "*bot" suffixed)
    "twitterbot",
    "linkedinbot",
    "slackbot",
    "slack-imgproxy",
    "telegrambot",
    "discordbot",
    "redditbot",
    "embedly",
    "skypeuripreview",
    "bitlybot",
    // Search / SEO / monitoring crawlers
    "googlebot",
    "bingbot",
    "yandex",
    "duckduckbot",
    "baiduspider",
    "applebot",
    "ahrefsbot",
    "semrushbot",
    "mj12bot",
    "dotbot",
    "petalbot",
    // Headless browsers / automation / HTTP tooling
    "headlesschrome",
    "phantomjs",
    "puppeteer",
    "playwright",
    "selenium",
    "python-requests",
    "python-urllib",
    "go-http-client",
    "node-fetch",
    "axios",
    "okhttp",
    "curl",
    "wget",
    "libwww-perl",
    "httpclient",
    "lighthouse",
    "gtmetrix",
    "pingdom",
    "uptimerobot",
    // Generic catch-alls (broad but safe whole-word / stem tokens)
    "\\bbot\\b",
    "crawler",
    "spider",
    "crawling",
  ].join("|"),
  "i",
);

/**
 * True if the User-Agent looks like a bot / crawler / automation client — or is
 * missing entirely (a real browser always sends one; an absent UA is a script).
 * For ANALYTICS only; use isCrawlerUserAgent to gate opt-ins.
 */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || !ua.trim()) return true;
  return BOT_UA.test(ua);
}

/**
 * Friendly source label for a bot User-Agent, used to break the collapsed bot row
 * down by WHICH agent is hitting (Meta ad-review vs a search crawler vs tooling).
 * First match wins, so order runs specific -> generic. Derived at read time from
 * the stored UA, so it needs no column and applies to already-recorded hits.
 */
const BOT_SOURCES: [RegExp, string][] = [
  [/meta-externalagent/i, "Meta ad-review"],
  [/facebookexternalhit/i, "Facebook crawler"],
  [/facebookcatalog/i, "Facebook catalog"],
  [/facebot/i, "Facebot"],
  [/twitterbot/i, "Twitterbot"],
  [/linkedinbot/i, "LinkedInBot"],
  [/slackbot|slack-imgproxy/i, "Slackbot"],
  [/telegrambot/i, "Telegram"],
  [/discordbot/i, "Discord"],
  [/redditbot/i, "Reddit"],
  [/whatsapp/i, "WhatsApp"],
  [/googlebot|mediapartners/i, "Googlebot"],
  [/bingbot/i, "Bingbot"],
  [/yandex/i, "Yandex"],
  [/duckduckbot/i, "DuckDuckBot"],
  [/baiduspider/i, "Baidu"],
  [/applebot/i, "Applebot"],
  [/ahrefsbot/i, "AhrefsBot"],
  [/semrushbot/i, "SemrushBot"],
  [/mj12bot|dotbot|petalbot|embedly|skypeuripreview|bitlybot/i, "Other crawler"],
  [/lighthouse|gtmetrix|pingdom|uptimerobot/i, "Monitor"],
  [/headlesschrome|phantomjs|puppeteer|playwright|selenium/i, "Headless browser"],
  [/python-requests|python-urllib|go-http-client|node-fetch|axios|okhttp|curl|wget|libwww|httpclient|scrapy|java\//i, "HTTP client"],
];

/** Short source name for a bot UA (e.g. "Meta ad-review"). Empty UA => "No user-agent". */
export function botSourceFromUserAgent(ua: string | null | undefined): string {
  const s = (ua ?? "").trim();
  if (!s) return "No user-agent";
  for (const [re, label] of BOT_SOURCES) {
    if (re.test(s)) return label;
  }
  return "Other bot";
}
