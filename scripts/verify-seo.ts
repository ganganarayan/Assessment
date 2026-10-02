/**
 * The content gate. Run before every push; it is the thing that makes "the SEO content is
 * consistent" a fact rather than a hope.
 *
 * What it refuses to let through:
 *  - content that does not match its schema (shape, lengths, the single-sentence rule)
 *  - a dangling reference: a related answer, internal link or pillar that does not exist
 *  - an orphan: an answer no pillar links to
 *  - a keyword claimed by two pages — the cannibalisation check, and the reason this
 *    script exists at all
 *  - the robots host rule regressing, which is the one piece of Phase A that cannot be
 *    observed from staging because staging is not the platform host
 *
 * Writes docs/seo/keyword-map.json as a side effect, so the map is never stale.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ANSWERS, PAGES, TOPICS, auditContent } from "../src/lib/seo/registry";
import { buildKeywordMap } from "../src/lib/seo/keyword-map";
import { isPlatformHost, PLATFORM_HOST } from "../src/lib/seo/urls";

const MAP_PATH = "docs/seo/keyword-map.json";

function main(): void {
  const failures: string[] = [];

  // Shape is already validated by importing the registry: a malformed module throws
  // above this line with its own filename in the message.
  console.log(`content: ${TOPICS.length} topics, ${PAGES.length} pages, ${ANSWERS.length} answers`);

  for (const problem of auditContent()) {
    failures.push(`${problem.where}: ${problem.problem}`);
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

  mkdirSync(dirname(MAP_PATH), { recursive: true });
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + "\n", "utf8");
  console.log(`keyword map: ${Object.keys(map.index).length} terms -> ${MAP_PATH}`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nseo content OK");
}

main();
