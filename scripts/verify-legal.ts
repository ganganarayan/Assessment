/**
 * The policy pages, held to what a Meta app reviewer actually does with them.
 *
 * 🔴 WHY THIS IS A BUILD GATE. The Meta app behind every tenant's WhatsApp connect
 * button cannot be SUBMITTED for App Review while "User data deletion" is empty, and
 * the settings form refuses to persist at all while it is - which is why Privacy Policy
 * URL and Category kept reverting to blank and the app kept reporting itself
 * ineligible. The URL we gave them has to stay a real page with the deletion route
 * visible on it. A reviewer who cannot see the route on the first screen rejects the
 * URL, and that costs days, not minutes.
 *
 * What it holds in place:
 *   1. Both pages exist as routes, and every link in the policy header resolves. A
 *      404 behind a URL handed to a reviewer is the whole submission.
 *   2. /data-deletion is in the public sitemap. It is a URL we have promised a third
 *      party, so it is not allowed to quietly drop out of the list.
 *   3. The privacy policy LINKS to it rather than burying erasure in a clause. That
 *      link is why the separate page exists.
 *   4. Nothing company-specific is hardcoded. These pages are read by a second
 *      deployment of this product too, and the one thing worse than a missing address
 *      is somebody else's address on a page claiming to be theirs.
 *   5. Neither page is behind auth or behind a tenant host, because a reviewer opens
 *      them signed out.
 *
 *   npx tsx scripts/verify-legal.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { publicSitemapEntries } from "../src/lib/seo/sitemap-entries";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

const APP = join(process.cwd(), "src", "app");
const routeFile = (path: string) => join(APP, ...path.split("/").filter(Boolean), "page.tsx");

console.log("Legal page verification\n");

/* 1. The routes, and every link in the policy header. ------------------------ */

const shellSrc = readFileSync(
  join(process.cwd(), "src", "components", "marketing", "LegalShell.tsx"),
  "utf8",
);
const shellLinks = [...shellSrc.matchAll(/href="(\/[a-z0-9-]*)"/g)]
  .map((m) => m[1])
  .filter((v): v is string => !!v);

expect("the policy header has links", shellLinks.length > 0, "the regex above needs updating, not the shell");
for (const path of new Set(shellLinks)) {
  expect(
    `${path} is a real route`,
    existsSync(routeFile(path)),
    "every policy page carries this header, and any of their URLs may be the one a reviewer is given. A link to a 404 is a rejection.",
  );
}
expect(
  "the deletion route is linked next to Privacy, not last",
  shellLinks.indexOf("/data-deletion") <= shellLinks.indexOf("/refund"),
  "the reviewer looks at the first screen. A link below the fold is a link they do not see.",
);

for (const path of ["/privacy", "/data-deletion"]) {
  expect(`${path} exists`, existsSync(routeFile(path)), "this is the URL in the Meta app settings");
}

/* 2. The sitemap we publish. ------------------------------------------------- */

const paths = new Set(publicSitemapEntries().map((e) => e.path));
for (const path of ["/privacy", "/data-deletion", "/terms"]) {
  expect(
    `${path} is in the public sitemap`,
    paths.has(path),
    "a URL promised to a third party has to stay discoverable; the sitemap is where that is asserted rather than hoped",
  );
}

/* 3. The privacy policy points at the deletion page. ------------------------- */

const privacySrc = readFileSync(routeFile("/privacy"), "utf8");
const deletionSrc = readFileSync(routeFile("/data-deletion"), "utf8");

expect(
  "the privacy policy links to the deletion page",
  /href="\/data-deletion"/.test(privacySrc),
  "erasure is one clause of one section in the policy. The link is the whole reason the separate page exists.",
);
expect(
  "the deletion page says how to ask",
  /mailto:/.test(deletionSrc),
  "Meta accepts a page a person can read INSTEAD of a callback endpoint, which means the page has to contain the route itself",
);
expect(
  "the deletion page says what happens and how long it takes",
  /delete/i.test(deletionSrc) && /\bdays\b|\bhours\b|\bwithin\b/i.test(deletionSrc),
  "a page that only says 'email us' is not deletion instructions",
);

/* 4. Nothing company-specific is baked in. ----------------------------------- */

for (const [name, src] of [
  ["privacy", privacySrc],
  ["data-deletion", deletionSrc],
] as const) {
  expect(
    `${name} reads its company details from Settings`,
    /getLegalConfig\(/.test(src),
    "a second deployment of this product must never show somebody else's contact address",
  );
  const emails = [...src.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) => m[0]);
  expect(
    `${name} hardcodes no email address`,
    emails.length === 0,
    `found ${emails.join(", ")}. Never hardcode tenant-specific values: the contact address belongs to whoever runs the install.`,
  );
}

/* 5. Signed out, on the platform host. --------------------------------------- */

for (const [name, src] of [
  ["privacy", privacySrc],
  ["data-deletion", deletionSrc],
] as const) {
  expect(
    `${name} is not behind a session`,
    !/requireUser|requireAuth|resolveActingScope|auth\(\)/.test(src),
    "a reviewer opens this URL signed out. A redirect to /sign-in is a rejected submission.",
  );
  expect(
    `${name} declares its own canonical path`,
    new RegExp(`path: "/${name === "privacy" ? "privacy" : "data-deletion"}"`).test(src),
    "a canonical pointing somewhere else sends the reviewer, and every crawler, to a different page than the one they were given",
  );
}

console.log(
  failures === 0
    ? "\n🟢 Both policy pages exist, every header link resolves, the deletion route is linked and published, and no company detail is hardcoded.\n"
    : `\n🔴 ${failures} check(s) failed. The Meta app submission depends on these URLs.\n`,
);
process.exit(failures === 0 ? 0 : 1);

export {};
