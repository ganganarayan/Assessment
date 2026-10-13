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
 * Each sweep writes its own tally to result.json beside its report, and that is what is
 * read back here. The runner deliberately does NOT pipe the children's output: piping it
 * through a second process and on into a redirect made a healthy sweep look hung for
 * minutes at a time. The children write straight to the same place this does.
 *
 * Exits non-zero when any funnel has a failure, so it can gate a push.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { QA_ROOT, REPO_ROOT } from "./env.js";

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

function runOne(slug: string, passThrough: string[]): Outcome {
  const startedAt = Date.now();
  // npm.cmd directly rather than through a shell: passing arguments to a shell
  // concatenates them unescaped, which Node now warns about. stdio inherited, so the
  // sweep's own output goes where this command's output goes, with nothing in between.
  const child = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "--silent", "qa", "--", `--slug=${slug}`, ...passThrough],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
  return { slug, code: child.status ?? 1, tally: readTally(slug, startedAt) };
}

function main(): number {
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
    outcomes.push(runOne(slug, passThrough));
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

process.exit(main());
