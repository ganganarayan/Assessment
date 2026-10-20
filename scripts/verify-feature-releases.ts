/**
 * Feature-release verification (no DB). The release switches are the thing that stands
 * between a finished-but-unproven feature and every customer on the platform, so the
 * parts of them that can be checked statically are checked in the build.
 *
 * What it proves:
 *   1. The catalog is complete and internally consistent (every key has an entry, no
 *      route is owned by two features, every route is a real /w path).
 *   2. Every key has a SEED ROW in the migration, or is deliberately defaulted. A key
 *      added in code with no row anywhere falls back to its default silently, and
 *      "silently" is the word that makes it a production incident rather than a bug.
 *   3. The seeded value AGREES with the catalog default. Two sources saying different
 *      things about whether customers have a feature is the failure this file exists
 *      to make impossible.
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
    fail(
      `${key} is seeded`,
      "no INSERT in any migration names this key. It would fall back to the catalog default with no row and no audit date - add a seed row.",
    );
    continue;
  }
  if (seeded === "carried") {
    ok(`${key} is seeded (carried over from an existing switch)`);
    continue;
  }
  expect(
    `${key} seed agrees with its catalog default`,
    (seeded === "true") === defaultReleased(key),
    `migration seeds ${seeded}, catalog default is ${defaultReleased(key)}. One of them is lying about whether customers have it.`,
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
// A route in the catalog with no guard on its page is the failure mode that matters
// most: the menu item disappears and the URL still works, which is the difference
// between a held-back feature and a hidden one.
for (const f of RELEASABLE_FEATURES) {
  for (const route of f.routes) {
    const page = join(process.cwd(), "src", "app", ...route.split("/").filter(Boolean), "page.tsx");
    let src = "";
    try {
      src = readFileSync(page, "utf8");
    } catch {
      fail(`${route} has a page`, `expected ${page}`);
      continue;
    }
    expect(
      `${route} guards itself`,
      src.includes(`requireReleasedFeature("${f.key}")`),
      "the page is reachable by typing the URL. Add await requireReleasedFeature(...) at the top.",
    );
  }
}

console.log(failures === 0 ? "\nAll feature-release checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
