/**
 * The content gate. Run before every push; it is the thing that makes "the SEO content is
 * consistent" a fact rather than a hope.
 *
 * What it refuses to let through:
 *  - content that does not match its schema (shape, lengths, the single-sentence rule)
 *  - a dangling reference: a related answer, internal link or pillar that does not exist
 *  - an orphan: an answer no pillar links to
 *  - a keyword claimed by two pages - the cannibalisation check, and the reason this
 *    script exists at all
 *  - the robots host rule regressing, which is the one piece of Phase A that cannot be
 *    observed from staging because staging is not the platform host
 *  - a page in the registry with no route file. Pillars are bound to STATIC routes (a
 *    root-level catch-all broke the no-html-link-for-pages lint rule repo-wide), which
 *    means adding content without adding its route is a silent 404. This turns that into
 *    a failed check instead of a page nobody notices is missing.
 *
 * Writes docs/seo/keyword-map.json as a side effect, so the map is never stale.
 */
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ANSWERS, PAGES, TOPICS, auditContent } from "../src/lib/seo/registry";
import { buildKeywordMap } from "../src/lib/seo/keyword-map";
import { isPlatformHost, PLATFORM_HOST } from "../src/lib/seo/urls";
import { publicSitemapEntries } from "../src/lib/seo/sitemap-entries";
import { HERO, DISQUALIFIED_COST, REAL_COST } from "../src/lib/marketing/content";
import { publicRobotsRules } from "../src/app/robots";
import { MARKETING } from "../src/lib/marketing/content";

const MAP_PATH = "docs/seo/keyword-map.json";

function main(): void {
  const failures: string[] = [];

  // Shape is already validated by importing the registry: a malformed module throws
  // above this line with its own filename in the message.
  console.log(`content: ${TOPICS.length} topics, ${PAGES.length} pages, ${ANSWERS.length} answers`);

  for (const problem of auditContent()) {
    failures.push(`${problem.where}: ${problem.problem}`);
  }

  for (const page of PAGES) {
    const route = `src/app/${page.slug}/page.tsx`;
    if (!existsSync(route)) {
      failures.push(`page/${page.slug}: no route file at ${route}`);
    }
  }

  const map = buildKeywordMap();
  for (const c of map.collisions) {
    failures.push(`keyword "${c.term}" is claimed by ${c.urls.length} pages: ${c.urls.join(", ")}`);
  }

  // Phase A's host rule, asserted rather than trusted. The platform branch of robots.txt
  // only ever runs on production, so this is where it gets checked.
  const hostCases: Array<[string, boolean]> = [
    [PLATFORM_HOST, true],
    [PLATFORM_HOST.toUpperCase(), true],
    ["orbitq-assess.applygitawisdom.com", false],
    ["acme.example.com", false],
    ["", false],
  ];
  for (const [host, expected] of hostCases) {
    if (isPlatformHost(host) !== expected) {
      failures.push(`isPlatformHost("${host}") should be ${expected}`);
    }
  }

  // Everything below is asserted rather than observed, because the routes that serve it
  // are gated to the production host and so are empty everywhere they could be inspected.
  const sitemapPaths = new Set(publicSitemapEntries().map((e) => e.path));
  for (const page of PAGES) {
    if (!sitemapPaths.has(`/${page.slug}`)) failures.push(`page/${page.slug}: missing from sitemap`);
  }
  for (const answer of ANSWERS) {
    if (!sitemapPaths.has(`/answers/${answer.slug}`)) {
      failures.push(`answer/${answer.slug}: missing from sitemap`);
    }
  }
  if (sitemapPaths.has("/sign-in")) failures.push("sitemap: /sign-in should not be listed");

  const rules = publicRobotsRules();
  const agents = new Set(rules.map((r) => r.userAgent));
  for (const required of ["*", "OAI-SearchBot", "GPTBot", "ClaudeBot", "PerplexityBot"]) {
    if (!agents.has(required)) failures.push(`robots: no rule for ${required}`);
  }
  for (const r of rules) {
    for (const required of ["/admin", "/w", "/api"]) {
      if (!r.disallow.includes(required)) {
        failures.push(`robots: ${r.userAgent} does not disallow ${required}`);
      }
    }
  }

  /**
   * The brand has to name its category, on the one query where the answer must be
   * unambiguous.
   *
   * Three unrelated entities use "Assess360" or a near variant in search. The homepage
   * title and description are the strongest signals that say which one this is, and
   * both are one careless copy edit away from being a promise with no category in it,
   * which is how they read before this check existed. Length is checked too: a title
   * Google truncates cannot do the job it is here to do.
   */
  const CATEGORY = "lead qualification software";
  if (!MARKETING.title.toLowerCase().includes(CATEGORY)) {
    failures.push(`marketing title does not name the category ("${CATEGORY}"): ${MARKETING.title}`);
  }
  if (MARKETING.title.length > 60) {
    failures.push(`marketing title is ${MARKETING.title.length} chars; Google truncates past ~60`);
  }
  // Every page needs its OWN meta description and title.
  //
  // A shared description is not a cosmetic problem: it is the line Google prints under
  // the result, so two pages carrying the same one are competing for the same click with
  // identical copy, and the crawler has been given a reason to treat one of them as a
  // duplicate of the other. It happens by copy-paste and nothing errors when it does,
  // which is exactly why it needs a check rather than a convention.
  for (const [field, label] of [
    ["description", "meta description"],
    ["title", "title tag"],
  ] as const) {
    const seen = new Map<string, string[]>();
    for (const p of PAGES) {
      const key = p[field].trim().toLowerCase();
      seen.set(key, [...(seen.get(key) ?? []), p.slug]);
    }
    for (const [, slugs] of seen) {
      if (slugs.length > 1) failures.push(`${slugs.length} pages share one ${label}: ${slugs.join(", ")}`);
    }
  }

  // Answers share a template by nature, so only their QUESTION has to be distinct.
  {
    const seen = new Map<string, string[]>();
    for (const a of ANSWERS) {
      const key = a.question.trim().toLowerCase();
      seen.set(key, [...(seen.get(key) ?? []), a.slug]);
    }
    for (const [, slugs] of seen) {
      if (slugs.length > 1) failures.push(`${slugs.length} answers share one question: ${slugs.join(", ")}`);
    }
  }

  if (!MARKETING.description.toLowerCase().includes(CATEGORY)) {
    failures.push(`marketing description does not name the category ("${CATEGORY}")`);
  }
  if (MARKETING.description.length > 165) {
    failures.push(`marketing description is ${MARKETING.description.length} chars; aim for 165 or fewer`);
  }

  mkdirSync(dirname(MAP_PATH), { recursive: true });
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + "\n", "utf8");
  console.log(`keyword map: ${Object.keys(map.index).length} terms -> ${MAP_PATH}`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  /**
   * The home page's H1 makes a countable claim, and the section under it is the count.
   *
   * "10 times in 10 different ways" is only persuasive because a reader can scroll one
   * section and audit it, so the number has to equal the length of the bill. Nothing in
   * TypeScript connects a sentence to an array length: the headline is a string and the
   * chain is data, and adding an eleventh charge would leave the page disproving itself
   * one scroll below its own promise. Hence a check.
   */
  const claimed = HERO.headline.match(/(\d+)\s+times/);
  if (!claimed) {
    failures.push("hero: the H1 no longer states a countable number of charges, so the bill below it is unanchored");
  } else if (Number(claimed[1]) !== DISQUALIFIED_COST.chain.length) {
    failures.push(
      `hero: the H1 claims ${claimed[1]} charges and DISQUALIFIED_COST.chain lists ${DISQUALIFIED_COST.chain.length}`,
    );
  }

  /**
   * RealCost's worked example has to actually work out.
   *
   * The whole section invites a reader to check it against their own accounts, so the
   * one unrecoverable error here is arithmetic that does not survive being multiplied:
   * somebody who catches us rounding in our own favour stops believing the eighteen
   * charges listed above it too. The three numbers live in three separate sentences, so
   * editing one of them and not the others is a one-word change away at all times.
   */
  const calls = REAL_COST.mathHeading.match(/(\d+)\s+calls/);
  const minutes = REAL_COST.recurring.map((r) => r.text.match(/(\d+)\s+minutes/)).find(Boolean);
  const hours = REAL_COST.math.map((r) => r.text.match(/(\d+)\s+hours/)).find(Boolean);
  if (!calls || !minutes || !hours) {
    failures.push("real cost: the worked example no longer states calls, minutes and hours, so it cannot be checked");
  } else {
    const expected = (Number(calls[1]) / 2) * (Number(minutes[1]) / 60);
    if (expected !== Number(hours[1])) {
      failures.push(
        `real cost: half of ${calls[1]} calls at ${minutes[1]} minutes is ${expected} hours, but the page says ${hours[1]}`,
      );
    }
  }

  console.log("\nseo content OK");
}

main();
