/**
 * Call-to-action link repair verification (no DB, no network).
 *
 * The field this guards is the destination of every button on every public page, and a
 * typo in it fails silently: the buttons still render, the pages still look right, and
 * the funnel simply stops receiving anybody. So the repair rules get a test each.
 *
 * Two properties matter more than any individual case:
 *   1. a path must never be turned into a host, or a host into a path - that is the
 *      mistake that produced "https//assess360..." as a RELATIVE path;
 *   2. a value that is already correct must come back untouched, because an editor
 *      that rewrites good input teaches you to stop reading what it says.
 *
 *   npx tsx scripts/verify-cta-link.ts
 */
import { absoluteCtaUrl, repairCtaHref, repairSentence } from "../src/lib/marketing/cta-link";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

const repairsTo = (input: string, want: string) => {
  const r = repairCtaHref(input);
  expect(
    `${JSON.stringify(input)} -> ${want}`,
    r.valid && r.value === want,
    `got ${JSON.stringify(r.value)} valid=${r.valid} notes=[${r.notes.join("; ")}]`,
  );
};

console.log("CTA link repair verification\n");

console.log("Already correct, left alone:");
for (const good of [
  "/a/paying-for-junk-leads",
  "/a/paying-for-junk-leads?x=1",
  "/pricing#tiers",
  "https://assess360.divineleads.guru/a/paying-for-junk-leads",
]) {
  const r = repairCtaHref(good);
  expect(`untouched: ${good}`, r.valid && !r.changed, `got ${r.value}, notes [${r.notes.join("; ")}]`);
}

console.log("\nScheme typos:");
repairsTo("https//assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
repairsTo("https:/assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
repairsTo("https:assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
repairsTo("https:///assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
repairsTo("htps://assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
repairsTo("htp://assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
repairsTo("httpss://assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
repairsTo("http://assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
repairsTo("//assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
repairsTo("assess360.divineleads.guru/a/x", "https://assess360.divineleads.guru/a/x");
// A host carrying a port has a colon before its first slash, like a scheme does, and
// is the one case where that colon is not one.
repairsTo("staging.example.com:8443/a/x", "https://staging.example.com:8443/a/x");

console.log("\nPaths on this site:");
repairsTo("a/paying-for-junk-leads", "/a/paying-for-junk-leads");
repairsTo("//a//paying-for-junk-leads", "/a/paying-for-junk-leads");
repairsTo("/a//paying-for-junk-leads", "/a/paying-for-junk-leads");
repairsTo("  /a/paying-for-junk-leads  ", "/a/paying-for-junk-leads");
repairsTo('"/a/paying-for-junk-leads"', "/a/paying-for-junk-leads");
repairsTo("/a/paying for junk leads", "/a/payingforjunkleads");
repairsTo("/a/paying-for-junk-leads.", "/a/paying-for-junk-leads");

console.log("\nRefused outright:");
for (const bad of [
  "javascript:alert(1)",
  "data:text/html,<h1>x</h1>",
  "ftp://example.com/x",
]) {
  const r = repairCtaHref(bad);
  expect(`invalid: ${bad}`, !r.valid, `got valid=${r.valid} value=${r.value}`);
}

console.log("\nBlank is a valid answer (it restores the default):");
{
  const r = repairCtaHref("   ");
  expect("blank stays blank and valid", r.valid && r.value === "", `got ${JSON.stringify(r.value)}`);
}

console.log("\nResolving against the site's own origin:");
expect(
  "a path resolves against the origin",
  absoluteCtaUrl("/a/x", "https://assess360.divineleads.guru") ===
    "https://assess360.divineleads.guru/a/x",
  String(absoluteCtaUrl("/a/x", "https://assess360.divineleads.guru")),
);
expect(
  "an absolute url keeps its own host",
  absoluteCtaUrl("https://other.example/a/x", "https://assess360.divineleads.guru") ===
    "https://other.example/a/x",
  String(absoluteCtaUrl("https://other.example/a/x", "https://assess360.divineleads.guru")),
);
expect("http is refused", absoluteCtaUrl("http://other.example/x", "https://a.example") === null);

console.log("\nThe sentence the owner reads:");
expect("no notes, no sentence", repairSentence([]) === null);
expect("one note", repairSentence(["switched http to https"]) === "Fixed the link: switched http to https.");
expect(
  "two notes join with and",
  repairSentence(['added the missing ":"', 'added the missing "//"']) ===
    'Fixed the link: added the missing ":" and added the missing "//".',
);

console.log(
  failures === 0 ? "\nAll CTA link checks passed." : `\n${failures} CTA link check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
