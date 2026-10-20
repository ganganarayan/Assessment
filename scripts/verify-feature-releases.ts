/**
 * Feature-release verification (no DB). The release switches are the thing that stands
 * between a finished-but-unproven feature and every customer on the platform, so the
 * parts of them that can be checked statically are checked in the build.
 *
 * What it proves:
 *   1. The catalog is complete and internally consistent (every key has an entry, no
 *      route is owned by two features, every route is a real /w path).
 *   2. A key with no SEED ROW starts held back. It does not need a migration: an
 *      absent row falls back to the catalog default, and since every default is false
 *      (check 3) that fallback is the safe state, visible in the console as "never
 *      released". This was once a hard failure, on the reasoning that a key with no
 *      row defaults SILENTLY - true while the defaults could say true, pointless now
 *      that they cannot, and it would have forced a migration for a row the first flip
 *      writes anyway. What is still a failure is the pair that cannot be safe: no row
 *      AND a default of released.
 *   3. Every catalog default is FALSE. The default is the answer used when the row is
 *      missing or unreadable, and it must not claim a feature is live: the same code
 *      runs against staging and production, where the answer differs, so only the row
 *      may say yes. A default of true once meant production would have released three
 *      features to every customer on its first deploy.
 *   4. routesHeldBack hides exactly the routes of the features that are held back -
 *      nothing more (a released feature losing its menu item) and nothing less (a held
 *      feature keeping one).
 *
 *   npx tsx scripts/verify-feature-releases.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  FEATURE_RELEASE_KEYS,
  RELEASABLE_FEATURES,
  defaultReleased,
  isFeatureReleaseKey,
  releasableFeature,
  routesHeldBack,
  type FeatureReleaseKey,
} from "../src/lib/features/catalog";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Feature release verification\n");

// --- 1. The catalog ---------------------------------------------------------------
expect(
  "every key has a catalog entry",
  FEATURE_RELEASE_KEYS.every((k) => !!releasableFeature(k)),
  "a key in FEATURE_RELEASE_KEYS with no entry in RELEASABLE_FEATURES",
);
expect(
  "no entry is a stranger to the key list",
  RELEASABLE_FEATURES.every((f) => isFeatureReleaseKey(f.key)),
);
expect("every entry is described", RELEASABLE_FEATURES.every((f) => !!f.label && !!f.blurb && !!f.whileHeld));

const allRoutes = RELEASABLE_FEATURES.flatMap((f) => f.routes);
expect(
  "no route is owned by two features",
  new Set(allRoutes).size === allRoutes.length,
  `routes: ${allRoutes.join(", ")}`,
);
expect(
  "every route is a workspace path",
  allRoutes.every((r) => r.startsWith("/w/")),
  "a release switch only hides owner-facing /w routes - public links stay up on purpose",
);

// --- 2 and 3. The seed rows -------------------------------------------------------
const migrationsDir = join(process.cwd(), "prisma", "migrations");
const sql = readdirSync(migrationsDir)
  .filter((d) => !d.endsWith(".toml"))
  .map((d) => {
    try {
      return readFileSync(join(migrationsDir, d, "migration.sql"), "utf8");
    } catch {
      return "";
    }
  })
  .filter((s) => s.includes("feature_release"))
  .join("\n");

expect("the feature_release table has a migration", sql.includes('CREATE TABLE "feature_release"'));

/**
 * The value a key is seeded with, read from the INSERT statements.
 *
 * Deliberately crude: it looks for the key as a quoted literal on a line and takes the
 * boolean beside it. A key seeded from a SELECT (WhatsApp carries over its old column)
 * has no literal boolean, and that is reported as "carried over" rather than compared -
 * the point of carrying it over is that the value is whatever the owner left it as.
 */
function seededValue(key: FeatureReleaseKey): "true" | "false" | "carried" | "missing" {
  const line = sql.split("\n").find((l) => l.includes(`'${key}'`));
  if (!line) return "missing";
  if (/\btrue\b/i.test(line)) return "true";
  if (/\bfalse\b/i.test(line)) return "false";
  return "carried";
}

for (const key of FEATURE_RELEASE_KEYS) {
  const seeded = seededValue(key);
  if (seeded === "missing") {
    // No row is fine, as long as no row means held back. A new key can therefore be one
    // constant in the catalog plus its page guard, which is what makes adding a feature
    // to this list cheap enough that nobody routes around it.
    expect(
      `${key} has no seed row, so it starts held back`,
      defaultReleased(key) === false,
      "a key with no row AND a released default goes live on any database that has not seeded it - add a seed row or set the default false",
    );
  } else if (seeded === "carried") {
    ok(`${key} is seeded (carried over from an existing switch)`);
  } else {
    ok(`${key} is seeded (${seeded})`);
  }

  // 🔴 The panic answer must never claim a feature is live. The row is per database;
  // this constant is not, so a true here releases the feature on every database that
  // has no row yet - which is what production is on the day the table is created.
  expect(
    `${key} fails closed by default`,
    defaultReleased(key) === false,
    "set defaultReleased false and let the seeded row carry the live state",
  );
}

// --- 4. What the nav hides --------------------------------------------------------
const everything = new Set<string>(FEATURE_RELEASE_KEYS);
expect(
  "nothing is hidden when everything is released",
  routesHeldBack(everything).length === 0,
  `hid ${routesHeldBack(everything).join(", ")}`,
);

expect(
  "everything is hidden when nothing is released",
  routesHeldBack(new Set<string>()).length === allRoutes.length,
);

for (const f of RELEASABLE_FEATURES) {
  const allowed = new Set<string>(FEATURE_RELEASE_KEYS.filter((k) => k !== f.key));
  const hidden = routesHeldBack(allowed);
  expect(
    `holding back ${f.key} hides exactly its own routes`,
    hidden.length === f.routes.length && f.routes.every((r) => hidden.includes(r)),
    `hid ${hidden.join(", ") || "nothing"}, expected ${f.routes.join(", ") || "nothing"}`,
  );
}

// --- The guards are wired ---------------------------------------------------------
// A route in the catalog whose page has no guard is the failure mode that matters most:
// the menu item disappears and the URL still works, which is the difference between a
// held-back feature and a hidden one.
//
// A route whose page does NOT EXIST YET is a different thing entirely, and this check
// used to treat them the same. It cost four sessions half a day of red staging when a
// catalog entry was pushed one commit ahead of its screen - a route registered early
// 404s, nothing links to it (the catalog only ever HIDES routes; the menu is written by
// hand), and there is no surface for a customer to reach. Failing the build for it
// stopped every unrelated deploy to prevent nothing. So it is reported and allowed:
// the entry can land before the page, and the moment the page exists it must be guarded.
for (const f of RELEASABLE_FEATURES) {
  for (const route of f.routes) {
    const page = join(process.cwd(), "src", "app", ...route.split("/").filter(Boolean), "page.tsx");
    let src: string | null = null;
    try {
      src = readFileSync(page, "utf8");
    } catch {
      src = null;
    }
    if (src === null) {
      ok(`${route} is registered ahead of its screen (404 until it lands, nothing to leak)`);
      continue;
    }
    expect(
      `${route} guards itself`,
      src.includes(`requireReleasedFeature("${f.key}")`),
      "the page exists, so the URL works for anybody who has it. Add await requireReleasedFeature(...) at the top.",
    );
  }
}

console.log(failures === 0 ? "\nAll feature-release checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
