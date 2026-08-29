/**
 * Bot-detection verification (no DB). Exercises the pure helper in src/lib/bots.ts:
 * real browsers (incl. in-app browsers) pass as human; Meta ad-review agents,
 * crawlers, headless browsers, HTTP tooling, and empty UAs are flagged as bots.
 *
 *   npx tsx scripts/verify-bots.ts
 */
import { isBotUserAgent, botSourceFromUserAgent } from "../src/lib/bots";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Bot detection verification\n");

// --- Real humans: must NOT be flagged ---
const humans: [string, string][] = [
  ["Chrome/Android", "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"],
  ["Safari/iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"],
  ["Chrome/desktop", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"],
  ["Firefox", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0"],
  // In-app browsers (real people who tapped an ad inside the app) must pass.
  ["Instagram in-app", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 340.0.0.0"],
  ["Facebook in-app (FBAN)", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/470.0.0.0]"],
  ["WhatsApp in-app browser", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36"],
];
for (const [name, ua] of humans) {
  expect(`human: ${name}`, isBotUserAgent(ua) === false, `wrongly flagged as bot: ${ua}`);
}

// --- Bots / automation: MUST be flagged ---
const bots: [string, string][] = [
  ["Meta ad-review (externalagent)", "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)"],
  ["facebookexternalhit", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"],
  ["Facebot", "Facebot/1.0"],
  ["Twitterbot", "Twitterbot/1.0"],
  ["LinkedInBot", "LinkedInBot/1.0 (compatible; Mozilla/5.0)"],
  ["Slackbot", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"],
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
  ["Bingbot", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
  ["AhrefsBot", "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)"],
  ["HeadlessChrome", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36"],
  ["Playwright/webkit", "Mozilla/5.0 playwright"],
  ["python-requests", "python-requests/2.31.0"],
  ["curl", "curl/8.4.0"],
  ["Go-http-client", "Go-http-client/2.0"],
  ["generic 'bot' word", "SomeService Bot/2.0 (+http://example.com)"],
];
for (const [name, ua] of bots) {
  expect(`bot: ${name}`, isBotUserAgent(ua) === true, `not flagged: ${ua}`);
}

// --- Edge: missing / blank UA = bot ---
expect("empty UA -> bot", isBotUserAgent("") === true);
expect("whitespace UA -> bot", isBotUserAgent("   ") === true);
expect("null UA -> bot", isBotUserAgent(null) === true);
expect("undefined UA -> bot", isBotUserAgent(undefined) === true);

// --- botSourceFromUserAgent: friendly source labels ---
const sources: [string, string][] = [
  ["Meta ad-review", "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)"],
  ["Facebook crawler", "facebookexternalhit/1.1"],
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
  ["Bingbot", "Mozilla/5.0 (compatible; bingbot/2.0)"],
  ["AhrefsBot", "Mozilla/5.0 (compatible; AhrefsBot/7.0)"],
  ["LinkedInBot", "LinkedInBot/1.0"],
  ["Headless browser", "Mozilla/5.0 HeadlessChrome/126.0.0.0"],
  ["HTTP client", "python-requests/2.31.0"],
  ["No user-agent", ""],
];
for (const [label, ua] of sources) {
  expect(`source: ${label}`, botSourceFromUserAgent(ua) === label, `got "${botSourceFromUserAgent(ua)}" for ${ua || "(empty)"}`);
}
expect("source: unknown bot -> Other bot", botSourceFromUserAgent("SomeService Bot/2.0") === "Other bot");

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
