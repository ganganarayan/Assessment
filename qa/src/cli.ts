/**
 * The harness entry point.
 *
 *   npm run qa -- --slug=<funnel> --audit     what the funnel is, and is it safe to drive
 *   npm run qa -- --slug=<funnel>             the full sweep (added in the next layer)
 *
 * Flags are parsed by hand: this folder keeps exactly one dependency, and an argument
 * parser is not worth a second.
 */
import { resolve } from "node:path";
import { loadQaEnv, QA_ROOT } from "./env.js";
import { closeDb } from "./db.js";
import { readFunnel, type Funnel } from "./config/read.js";
import { preflight, renderGuard } from "./guard.js";
import { exitLabel } from "../../src/features/assessment/schemas.js";
import { generateCases, UnsupportedFunnel } from "./cases/generate.js";
import { expectationFor } from "./oracle/expect.js";
import { oracleContext } from "./oracle/context.js";
import type { CaseKind } from "./oracle/types.js";
import { sweep } from "./sweep.js";
import { renderTerminal, writeHtml, writeResultJson } from "./report/render.js";
import { newRunId } from "./drive/identity.js";
import { applyOverrides, loadOverrides, overrideExpectation, writeOverridesTemplate } from "./cases/overrides.js";
import { cleanupRun } from "./cleanup.js";

interface Args {
  slug: string;
  audit: boolean;
  plan: boolean;
  writeCases: boolean;
  headed: boolean;
  desktop: boolean;
  forceLive: boolean;
  allowProd: boolean;
  trace: boolean;
  admin: boolean;
  cleanup: boolean;
  only: string[];
  case: string;
  slow: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (!hit) return undefined;
    const eq = hit.indexOf("=");
    return eq === -1 ? "" : hit.slice(eq + 1);
  };
  const has = (name: string) => get(name) !== undefined;
  return {
    slug: get("slug") ?? "",
    audit: has("audit"),
    plan: has("plan"),
    writeCases: has("write-cases"),
    headed: has("headed"),
    desktop: has("desktop"),
    forceLive: has("force-live"),
    allowProd: has("i-know-this-is-prod"),
    trace: has("trace"),
    admin: has("admin"),
    cleanup: has("cleanup"),
    only: (get("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    case: get("case") ?? "",
    slow: Number(get("slow") ?? "0") || 0,
  };
}

function describe(f: Funnel): string {
  const r = f.row;
  const lines: string[] = [];
  lines.push(`  ${r.title}`);
  lines.push(`  tenant=${r.tenantId ?? "PLATFORM(null)"}  engine=${r.engine}  display=${r.questionDisplayMode}  next=${r.nextStep}`);
  lines.push(
    `  optin=${f.optinAfter ? "AFTER the questions" : "BEFORE the questions"}  ai=${r.useAiStatement ? "on" : "off"}  paid=${r.paidMode ? "yes" : "no"}  retake=${r.retakePolicy}${r.retakePolicy === "DELAYED" ? `/${r.retakeDays}d` : ""} by ${r.uniqueIdentifier}`,
  );

  lines.push(`  audience gate: ${f.audienceActive ? `${f.audience.mode}, ${f.audience.roles.length} role(s)${f.audience.mode === "FREETEXT" ? (f.audience.freeTextRequired ? ", required" : ", optional") : ""}` : "off"}`);
  if (f.audienceActive) {
    for (const role of f.audience.roles) {
      lines.push(`    - ${role.label}${role.target ? ` -> assessment ${role.target}` : " (continues here)"}`);
    }
  }

  lines.push(`  qualification gate: ${f.gateActive ? `on, ${f.qualification.questions.length} question(s)` : "off"}`);
  if (f.gateActive) {
    const b = f.qualification.bands;
    lines.push(`    bands: ${b.enabled ? `pass >= ${b.passMin}, review >= ${b.reviewMin}, below -> exit "${b.belowExitKey || "(first)"}"` : "off"}`);
    for (const q of f.qualification.questions) {
      lines.push(`    Q ${q.text}  [${q.type}${q.required ? ", required" : ""}]`);
      for (const o of q.options) {
        const marks = [
          `${o.points} pt`,
          o.disqualifies ? `DISQUALIFIES -> exit "${o.exitKey || "(first)"}"` : "",
        ].filter(Boolean);
        lines.push(`      - ${o.label}  (${marks.join(", ")})`);
      }
    }
  }

  lines.push(`  exit routes: ${f.exits.length}`);
  f.exits.forEach((e, i) => {
    lines.push(`    [${e.key || `#${i}`}] ${exitLabel(e, i)}  mode=${e.mode}  event=${e.eventName || "(default)"}  capi=${e.fireDisqualifiedEvent ? "on" : "off"}${e.buttonUrl ? `  -> ${e.buttonUrl}` : ""}`);
  });

  const qs = r.categories.flatMap((c) => c.questions);
  const routes = qs.flatMap((q) => q.options.filter((o) => o.route)).length;
  lines.push(`  content: ${r.categories.length} category/ies, ${qs.length} question(s), ${r.resultBands.length} band(s), ${routes} conditional route(s)${f.routingActive ? "" : routes > 0 ? " (INERT: routing needs SINGLE display mode)" : ""}`);
  for (const band of r.resultBands) {
    lines.push(`    band ${band.minScore}-${band.maxScore}: ${band.title} [${band.level}]`);
  }
  return lines.join("\n");
}

/**
 * One funnel's sweep. Exported so the all-funnels runner can call it in process:
 * spawning npm was the first design and Windows refuses to spawn a .cmd without a
 * shell, while spawning it with one concatenates arguments unescaped.
 */
export async function runSweep(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const env = loadQaEnv();

  if (!args.slug) {
    console.log(`Usage: npm run qa -- --slug=<funnel-slug> [flags]

  --audit                  what the funnel is and whether driving it is safe; drives nothing
  --plan                   the cases it would run and what it expects; drives nothing
  --headed --slow=<ms>     a visible browser, slowly, so you can watch it fill
  --case=<id>              one case only
  --only=<kinds>           entry, audience, gate, routes, bands, edge (comma separated)
  --desktop                a desktop viewport instead of a phone
  --trace                  keep a Playwright trace per case
  --admin                  also read the run back through the admin screens
  --write-cases            write qa/cases/<slug>.yaml, the file where you get the last word
  --cleanup                remove this run's own rows afterwards
  --force-live             run even though a live pixel or CAPI token resolves
  --i-know-this-is-prod    run against a host that is not staging

Seed the fixtures with: npm run qa:seed   (and -- --rm to remove them)`);
    return 2;
  }

  console.log(`\nTarget: ${env.baseUrl}  funnel: ${args.slug}\n`);
  const funnel = await readFunnel(args.slug);
  console.log("Funnel");
  console.log(describe(funnel));

  const guard = await preflight(funnel, {
    allowLiveIntegrations: args.forceLive,
    isProdHost: env.looksLikeProd,
    allowProd: args.allowProd,
  });
  console.log("\nPre-flight");
  console.log(renderGuard(guard));

  if (guard.blocked) {
    console.log("\nRefusing to run: one or more blocking findings above.");
    return 1;
  }
  if (args.audit) {
    console.log("\nAudit only: the funnel and the pre-flight, nothing generated and nothing driven.");
    return 0;
  }

  // The cases, and what each one should do. Derived from the funnel, never hand-written.
  const only = args.only.filter((k): k is CaseKind =>
    ["entry", "audience", "gate", "routes", "bands", "edge"].includes(k),
  );
  let generated;
  try {
    generated = generateCases(funnel, only);
  } catch (e) {
    // A funnel shape the harness knows about and knows it cannot judge. Printed as a
    // refusal, not a crash: a stack trace reads as "the harness is broken", which sends
    // somebody debugging the wrong thing.
    if (e instanceof UnsupportedFunnel) {
      console.log("\nNot covered yet\n");
      console.log(e.message);
      console.log("");
      return 2;
    }
    throw e;
  }

  // The owner's file gets the last word: cases to skip, expectations to pin, and runs
  // of answers written by hand. Absent, the generated set stands as it is.
  const overrides = loadOverrides(args.slug);
  const applied = applyOverrides(funnel, generated, overrides);
  if (overrides.exists) console.log(`\nUsing ${overrides.path}`);
  for (const problem of applied.problems) console.log(`  [cases file] ${problem}`);
  if (args.writeCases) {
    const written = writeOverridesTemplate(funnel, generated);
    console.log(`\nWrote ${written} - edit it to skip cases, pin expectations or add your own.`);
  }

  const cases = applied.cases.filter((c) => !args.case || c.plan.id === args.case);
  const ctx = await oracleContext(funnel);

  console.log(`\nCases: ${cases.length}${args.case ? ` (filtered to ${args.case})` : ""}`);
  for (const c of cases) {
    if (c.unreachable) {
      console.log(`  [unreachable] ${c.plan.id}`);
      console.log(`    ${c.plan.title}`);
      console.log(`    ${c.unreachable}`);
      continue;
    }
    const e = overrideExpectation(expectationFor(funnel, c.plan, ctx), overrides.expect[c.plan.id]);
    const bits: string[] = [`opens on ${e.firstStep}`];
    if (e.gate) {
      bits.push(
        e.gate.outcome === "exit"
          ? `gate ${e.gate.score}/${e.gate.max} -> exit "${e.gate.exitName}" (${e.gate.exitMode}${e.gate.turnedAway ? ", turned away" : e.gate.takesAssessment ? ", takes the assessment" : ", lead captured"})`
          : `gate ${e.gate.score}/${e.gate.max} -> ${e.gate.outcome}${e.gate.band ? ` (${e.gate.band})` : ""}`,
      );
    }
    if (e.questionPath.length > 0) {
      bits.push(`${e.questionPath.length} question(s)${e.skipped.length ? `, ${e.skipped.length} skipped` : ""}`);
    }
    const finishes = !e.abandonsAtOptin && !e.blockedAtRequired;
    if (e.score && finishes) bits.push(`score ${e.score.total}/${e.score.max} = ${e.score.percentage}% -> ${e.score.bandTitle ?? "no band"}`);
    if (e.terminal && finishes) bits.push(`ends at ${e.terminal}`);
    if (e.abandonsAtOptin) bits.push("stops at the opt-in, owed an abandonment later");
    if (e.blockedAtRequired) bits.push("is stopped by the required question");
    if (e.expectsRetakeLockout) bits.push("and is locked out on the second attempt");
    if (e.redirectToSlug) bits.push(`hands off to /a/${e.redirectToSlug}`);
    console.log(`  ${c.plan.id}`);
    console.log(`    ${c.plan.title}`);
    console.log(`    expect: ${bits.join("; ")}`);
    console.log(`    rows: ${Object.entries(e.rows).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}`);
    console.log(`    events: fires ${e.events.fired.join(", ") || "nothing"}${e.events.never.length ? `; never ${e.events.never.join(", ")}` : ""}`);
  }

  if (args.plan) {
    console.log("\nPlan only, nothing was driven.");
    return 0;
  }

  const drivable = cases.filter((c) => !c.unreachable).length;
  console.log(`\nDriving ${drivable} case(s)${args.headed ? " in a visible browser" : ""}:`);
  const runId = newRunId();
  const result = await sweep(funnel, cases, ctx, overrides, {
    baseUrl: env.baseUrl,
    headed: args.headed,
    slowMo: args.slow,
    desktop: args.desktop,
    trace: args.trace,
    runId,
    outRoot: resolve(QA_ROOT, "reports"),
    admin: args.admin,
  });

  console.log(renderTerminal(result));
  if (args.cleanup) {
    const removed = await cleanupRun(funnel, result);
    console.log(
      `
Cleaned up this run: ${removed.submissions} submission(s), ${removed.gateEntries} gate entry/ies, ${removed.disqualifications} rejection(s).`,
    );
  }
  const htmlPath = writeHtml(result);
  writeResultJson(result);
  console.log(`Open it: ${htmlPath}`);

  return result.results.some((r) => r.verdict === "fail") ? 1 : 0;
}

/** Run directly (npm run qa) rather than imported by the all-funnels runner. */
const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("qa/src/cli.ts") === true;
if (invokedDirectly) {
  runSweep(process.argv.slice(2))
    .then(async (code) => {
      await closeDb();
      process.exit(code);
    })
    .catch(async (err: unknown) => {
      console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
      await closeDb();
      process.exit(1);
    });
}
