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
