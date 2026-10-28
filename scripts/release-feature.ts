/**
 * Flip a release switch from the command line.
 *
 *   npm run feature:release -- --on workflows waTemplates                 (local database)
 *   railway run -e production -s Postgres npm run feature:release -- --public --on workflows
 *
 * The platform console at /platform/releases is the normal way to do this, and it stays
 * the normal way: it records WHO flipped the switch, which this script cannot. This
 * exists for the case the console cannot serve - releasing from a machine that is not
 * signed in, or reading the real state of the switches on a database the owner is not
 * looking at through a browser.
 *
 * It writes through writeFeatureRelease and nothing else, so the releasedAt stamp, the
 * cache reset and the audit line cannot drift from what the console does. A key the
 * catalog does not know is refused rather than written: a row for a feature that does
 * not exist is a switch nobody can ever find again.
 */

type Mode = "on" | "off";

async function main() {
  const argv = process.argv.slice(2);
  const wantsOn = argv.includes("--on");
  const wantsOff = argv.includes("--off");
  const keys = argv.filter((a) => !a.startsWith("--"));

  if (argv.includes("--public")) await import("./public-db-url");

  const catalog = await import("../src/lib/features/catalog");
  const { writeFeatureRelease, resetFeatureReleaseCache } = await import("../src/lib/features/release");
  const { prisma } = await import("../src/lib/db/prisma");

  /**
   * 🔴 THE ROWS, READ DIRECTLY, AND NO FALLBACK.
   *
   * isFeatureReleased() exists to keep a live app safe when the database blips: it
   * answers with the catalog default, which is off for everything. That is the right
   * answer to serve a customer and the wrong one to PRINT to the owner, because an
   * unreachable database would report every feature as held back and look exactly like
   * a state somebody chose. This is the tool people reach for to find out what is
   * actually stored, so it either says that or fails loudly.
   */
  const show = async (heading: string) => {
    const rows = await prisma.featureRelease.findMany({ select: { key: true, released: true } });
    const stored = new Map(rows.map((r) => [r.key, r.released]));
    console.log(`\n${heading}`);
    for (const f of catalog.RELEASABLE_FEATURES) {
      const row = stored.get(f.key);
      const mark = row === undefined ? "--  " : row ? "ON  " : "off ";
      const note = row === undefined ? `  (no row, so customers see the default: ${f.defaultReleased ? "ON" : "off"})` : "";
      console.log(`  ${mark} ${f.key}${note}`);
    }
  };

  // Read-only by default. Naming no key, or naming neither direction, reports and
  // stops: a script that guesses which way to flip a customer-facing feature is worse
  // than one that refuses.
  if (!keys.length || (!wantsOn && !wantsOff)) {
    await show("Release switches as stored right now:");
    console.log(
      "\nNothing changed. Pass keys and a direction, e.g. --on workflows waTemplates (or --off).",
    );
    process.exit(0);
  }
  if (wantsOn && wantsOff) {
    console.error("Pass --on or --off, not both.");
    process.exit(1);
  }

  const unknown = keys.filter((k) => !catalog.isFeatureReleaseKey(k));
  if (unknown.length) {
    console.error(`Not a release key: ${unknown.join(", ")}`);
    console.error(`Known keys: ${catalog.FEATURE_RELEASE_KEYS.join(", ")}`);
    process.exit(1);
  }

  const mode: Mode = wantsOn ? "on" : "off";
  await show("Before:");
  for (const key of keys) {
    if (!catalog.isFeatureReleaseKey(key)) continue;
    await writeFeatureRelease(key, mode === "on", null, "Flipped by scripts/release-feature.ts");
  }
  resetFeatureReleaseCache();
  await show("After:");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// A module, not a global script: every script here declares `main`, and without an
// export tsc treats them as one shared scope and calls it a duplicate.
export {};
