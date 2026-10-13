/**
 * Everything, in one command.
 *
 * The fixtures exist to be swept together: between them they carry the three kinds of
 * exit route, all three jump actions, both opt-in positions, bands on both sides of a
 * gate and an audience role that hands off to another assessment. Sweeping them one by
 * one is four commands and four reports to compare by eye, which is three too many to
 * do after every change.
 *
 *   railway run npm run qa:all                       the fixtures
 *   railway run npm run qa:all -- --slugs=a,b,c      whatever you name instead
 *   railway run npm run qa:all -- --also=my-funnel   the fixtures plus yours
 *
 * Exits non-zero when any funnel has a failure, so it can gate a push.
 */
import { spawn } from "node:child_process";
import { REPO_ROOT } from "./env.js";

const FIXTURES = ["qa-fixture-gate", "qa-fixture-routing", "qa-fixture-audience"];

interface Outcome {
  slug: string;
  code: number;
  summary: string;
}

function runOne(slug: string, passThrough: string[]): Promise<Outcome> {
  return new Promise((resolve) => {
    // Through npm rather than node: the sweep is a TypeScript entry point that needs
    // tsx, and a child process does not inherit its loader. shell:true because npm is a
    // .cmd on Windows, which is where this runs.
    const child = spawn(
      "npm",
      ["run", "--silent", "qa", "--", `--slug=${slug}`, ...passThrough],
      // stderr is captured as well as shown: when a sweep dies before it prints a
      // tally, the reason is on stderr, and a summary line reading "Target: ..." helps
      // nobody.
      { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], shell: true },
    );
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      out += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      out += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => {
      // The one line worth repeating at the end: the tally if the sweep got that far,
      // otherwise whatever it said last, which on a bad run is the reason it stopped.
      const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
      const tally = lines.find((l) => / passed, .* failed,/.test(l));
      const planned = lines.find((l) => l.startsWith("Plan only") || l.startsWith("Audit only"));
      const summary = tally ?? planned ?? lines[lines.length - 1] ?? "nothing was printed";
      resolve({ slug, code: code ?? 1, summary });
    });
  });
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
    console.log(`${o.code === 0 ? "🟢" : "🟡"} ${o.slug.padEnd(24)} ${o.summary}`);
  }
  return outcomes.some((o) => o.code !== 0) ? 1 : 0;
}

main().then((code) => process.exit(code));
