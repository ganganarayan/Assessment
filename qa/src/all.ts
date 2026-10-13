/**
 * Everything, in one command.
 *
 * The fixtures exist to be swept together: between them they carry the three kinds of
 * exit route, all three jump actions, both opt-in positions, bands on both sides of a
 * gate and an audience role that hands off to another assessment. Sweeping them one by
 * one is three commands and three reports to compare by eye, which is two too many to
 * do after every change.
 *
 *   railway run npm run qa:all                       the fixtures
 *   railway run npm run qa:all -- --slugs=a,b,c      whatever you name instead
 *   railway run npm run qa:all -- --also=my-funnel   the fixtures plus yours
 *
 * Each sweep runs IN THIS PROCESS, one after another, and writes its own tally to a
 * result.json beside its report, which is what is read back here. Spawning them was the
 * first design and it was wrong twice over: piping a child's output through a second
 * process made a healthy sweep look hung for minutes, and on Windows spawning npm.cmd
 * without a shell is refused outright while spawning it with one concatenates arguments
 * unescaped. Calling a function is simpler than either.
 *
 * Exits non-zero when any funnel has a failure, so it can gate a push.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { QA_ROOT } from "./env.js";
import { runSweep } from "./cli.js";
import { closeDb } from "./db.js";

const FIXTURES = ["qa-fixture-gate", "qa-fixture-routing", "qa-fixture-audience"];

interface Tally {
  slug: string;
  cases: number;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  seconds: number;
}

interface Outcome {
  slug: string;
  code: number;
  tally: Tally | null;
}

/** The newest report this run produced for a funnel, if it got that far. */
function readTally(slug: string, startedAt: number): Tally | null {
  const reports = join(QA_ROOT, "reports");
  if (!existsSync(reports)) return null;
  const dirs = readdirSync(reports)
    .filter((d) => d.endsWith(`-${slug}`))
    .sort()
    .reverse();
  for (const dir of dirs) {
    const path = join(reports, dir, "result.json");
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as Tally;
      // Only a report from THIS run counts: an older one would quietly report a sweep
      // that never happened as a pass.
      const stamp = Date.parse(dir.slice(0, 24).replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ":$1:$2.$3Z"));
      if (Number.isFinite(stamp) && stamp < startedAt - 60_000) return null;
      return raw;
    } catch {
      return null;
    }
  }
  return null;
}

async function runOne(slug: string, passThrough: string[]): Promise<Outcome> {
  const startedAt = Date.now();
  let code = 1;
  try {
    code = await runSweep([`--slug=${slug}`, ...passThrough]);
  } catch (err) {
    // One funnel that cannot be swept is not a reason to skip the others.
    // Prisma's message starts with a blank line and buries the reason three lines in,
    // so take the first line that actually says something.
    const text = err instanceof Error ? err.message : String(err);
    const why = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "no reason given";
    console.error(`  the sweep stopped: ${why}`);
  }
  return { slug, code, tally: readTally(slug, startedAt) };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const valueOf = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit?.slice(name.length + 3);
  };
  const named = (valueOf("slugs") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const also = (valueOf("also") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const slugs = named.length > 0 ? named : [...FIXTURES, ...also];
  // Anything else (--headed, --only, --trace, --cleanup) is handed to each sweep.
  const passThrough = argv.filter((a) => !a.startsWith("--slugs=") && !a.startsWith("--also="));

  const outcomes: Outcome[] = [];
  for (const slug of slugs) {
    console.log(`\n${"=".repeat(72)}\n${slug}\n${"=".repeat(72)}`);
    outcomes.push(await runOne(slug, passThrough));
  }

  console.log(`\n${"=".repeat(72)}\nAll funnels\n${"=".repeat(72)}`);
  for (const o of outcomes) {
    const line = o.tally
      ? `${o.tally.pass} passed, ${o.tally.fail} failed, ${o.tally.warn} warnings, ${o.tally.skip} skipped, in ${o.tally.seconds}s`
      : o.code === 0
        ? "nothing was driven"
        : "the sweep did not finish - see its output above";
    console.log(`${o.code === 0 ? "🟢" : "🟡"} ${o.slug.padEnd(24)} ${line}`);
  }
  return outcomes.some((o) => o.code !== 0) ? 1 : 0;
}

main()
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error(`
Failed: ${err instanceof Error ? err.message : String(err)}`);
    await closeDb();
    process.exit(1);
  });
