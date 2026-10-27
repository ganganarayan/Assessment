/**
 * The by-industry pages, held to the things that break silently.
 *
 * 🔴 WHY THIS IS A BUILD GATE. There are twenty-one of these pages and every one of
 * them is reached only through generated navigation: the footer's By industry column,
 * the category grid on the home page, and the sitemap. Nothing on the site links an
 * industry page by hand. So the failure mode is not a crash, it is a page that ships
 * and is never seen by a visitor or a crawler, and no test fails and no build goes red.
 *
 * What it holds in place:
 *   1. Every page is reachable and published. Unique keys, path matching key, and a
 *      sitemap entry for each, because an unlisted URL is an uncrawled URL.
 *   2. Coverage is TOTAL against the template library. Every audience the home page
 *      advertises has a page written for it, so a category can never be a dead name in
 *      that grid while its neighbours are links.
 *   3. The category mapping is one-to-one. Two specs claiming one category would make
 *      the grid link silently drop one of them.
 *   4. A keywordSlug names a page that exists. It is what removes the keyword twin from
 *      the footer, so a typo there would list the audience twice and look like a bug.
 *   5. No currency is hardcoded in the copy. Every amount is now rendered from the
 *      visitor's currency, so a rupee symbol or the word rupees left in a label is a
 *      page that says one thing and shows another.
 *   6. No em dash, anywhere. House rule, and these files are nothing but prose.
 *   7. The arithmetic defaults are sane: more enquiries than outcomes, nothing at zero.
 *      A spec with more sales than qualified leads renders a 100% close rate and the
 *      whole calculator reads as a toy.
 *
 *   npx tsx scripts/verify-industries.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_CATEGORIES } from "../src/features/templates/schema";
import { INDUSTRY_PAGES } from "../src/lib/marketing/industries";
import { PAGES } from "../src/lib/seo/registry";
import { publicSitemapEntries } from "../src/lib/seo/sitemap-entries";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

const SPEC_DIR = join(process.cwd(), "src", "lib", "marketing", "industries");

// ---------------------------------------------------------------------------
//  1. Reachable and published
// ---------------------------------------------------------------------------
const keys = INDUSTRY_PAGES.map((p) => p.key);
expect(
  "every key is unique",
  new Set(keys).size === keys.length,
  "two specs share a key, so getIndustry returns the first and the other page is unreachable",
);

const wrongPath = INDUSTRY_PAGES.filter((p) => p.path !== `/industries/${p.key}`);
expect(
  "every path is /industries/<key>",
  wrongPath.length === 0,
  `the dynamic route resolves by segment, so a path that disagrees with its key 404s: ${wrongPath
    .map((p) => `${p.key} -> ${p.path}`)
    .join(", ")}`,
);

const sitemapPaths = new Set(publicSitemapEntries().map((e) => e.path));
const unlisted = INDUSTRY_PAGES.filter((p) => !sitemapPaths.has(p.path));
expect(
  "every page is in the public sitemap",
  unlisted.length === 0,
  `nothing links these by hand, so an unlisted page is never crawled: ${unlisted
    .map((p) => p.path)
    .join(", ")}`,
);

// ---------------------------------------------------------------------------
//  2 and 3. Coverage against the template library, one to one
// ---------------------------------------------------------------------------
// "Platform" is the owner's own bucket rather than an audience, so it is the one
// category that is deliberately not a link on the home page.
const AUDIENCE_CATEGORIES = TEMPLATE_CATEGORIES.filter((c) => c !== "Platform");
const covered = new Set<string>(INDUSTRY_PAGES.map((p) => p.category));
const missing = AUDIENCE_CATEGORIES.filter((c) => !covered.has(c));
expect(
  "every advertised audience has a page",
  missing.length === 0,
  `these categories are named on the home page with no page behind them: ${missing.join(", ")}`,
);

const categories = INDUSTRY_PAGES.map((p) => p.category);
expect(
  "no two pages claim the same category",
  new Set(categories).size === categories.length,
  "INDUSTRY_BY_CATEGORY is a Map, so the second spec wins and the first loses its link",
);

expect(
  "no page claims the Platform category",
  !categories.includes("Platform"),
  "Platform is the owner's own funnels, not an audience to sell to",
);

// ---------------------------------------------------------------------------
//  4. Keyword twins
// ---------------------------------------------------------------------------
const slugs = new Set(PAGES.map((p) => p.slug));
const badTwins = INDUSTRY_PAGES.filter((p) => p.keywordSlug !== null && !slugs.has(p.keywordSlug));
expect(
  "every keywordSlug names a real content page",
  badTwins.length === 0,
  `a slug that matches nothing silently stops de-duplicating the footer: ${badTwins
    .map((p) => `${p.key} -> ${p.keywordSlug}`)
    .join(", ")}`,
);

// ---------------------------------------------------------------------------
//  5, 6. The copy itself
// ---------------------------------------------------------------------------
const specFiles = readdirSync(SPEC_DIR).filter(
  (f) => f.endsWith(".ts") && !["index.ts", "types.ts", "define.ts"].includes(f),
);
expect(
  "one spec file per registered page",
  specFiles.length === INDUSTRY_PAGES.length,
  `${specFiles.length} files against ${INDUSTRY_PAGES.length} registered specs: a file that is never imported is a page that does not exist`,
);

for (const file of specFiles) {
  const src = readFileSync(join(SPEC_DIR, file), "utf8");
  if (src.includes("—")) {
    fail(`${file} has no em dash`, "house rule: use a comma or a plain hyphen");
  }
  // The symbol is rendered from the visitor's currency now. One left in the copy
  // would sit next to a dollar figure and contradict it.
  const stray = ["₹", "rupees", "lakh", "crore"].filter((t) => src.includes(t));
  if (stray.length > 0) {
    fail(
      `${file} hardcodes no currency`,
      `found ${stray.join(", ")}: amounts are rendered in the visitor's currency, so this would contradict the figure beside it`,
    );
  }
}
if (failures === 0) ok("no em dash and no hardcoded currency in any spec file");

// ---------------------------------------------------------------------------
//  7. The arithmetic defaults
// ---------------------------------------------------------------------------
for (const p of INDUSTRY_PAGES) {
  const l = p.leak;
  const positive =
    l.enquiriesDefault > 0 && l.outcomesDefault > 0 && l.valueDefault > 0 && l.spendDefault > 0;
  if (!positive) {
    fail(`${p.key} defaults are all positive`, "a zero renders an empty calculator on first paint");
    continue;
  }
  // The band leaves this many qualified; more sales than that caps the close rate
  // at 100% and the page stops being believable.
  const band = { most: 75, "two-thirds": 65, half: 50, third: 33 }[l.wrongFitDefaultBand];
  const qualified = Math.round(l.enquiriesDefault * (1 - band / 100));
  if (l.outcomesDefault > qualified) {
    fail(
      `${p.key} outcomes fit inside the qualified count`,
      `${l.outcomesDefault} ${l.outcomeUnitPlural} against ${qualified} qualified ${l.unit}s at the default band, which renders a 100% close rate`,
    );
  }
  if (l.caught.length !== 3) {
    fail(`${p.key} has three caught items`, `${l.caught.length} found; the factory supplies one`);
  }
  if (p.mechanism.signalPoints.length !== 3) {
    fail(`${p.key} has three signal points`, `${p.mechanism.signalPoints.length} found`);
  }
  if (p.after.steps.length !== 4) {
    fail(`${p.key} has four after steps`, `${p.after.steps.length} found`);
  }
  if (p.objections.length < 4) {
    fail(`${p.key} has at least four objections`, `${p.objections.length} found`);
  }
  if (p.fit.forList.length < 4 || p.fit.notList.length < 4) {
    fail(`${p.key} has a full fit and not-fit list`, "a short not-fit list reads as a sales page");
  }
}
if (failures === 0) ok("every spec's defaults and section counts are sane");

console.log(
  failures === 0
    ? `\n🟢 ${INDUSTRY_PAGES.length} industry pages: all reachable, all published, every advertised audience covered, no hardcoded currency.\n`
    : `\n🔴 ${failures} check(s) failed. These pages are reached only through generated navigation, so a failure here is a page nobody ever sees.\n`,
);
process.exit(failures === 0 ? 0 : 1);

export {};
