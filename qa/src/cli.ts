/**
 * The harness entry point.
 *
 *   npm run qa -- --slug=<funnel> --audit     what the funnel is, and is it safe to drive
 *   npm run qa -- --slug=<funnel>             the full sweep (added in the next layer)
 *
 * Flags are parsed by hand: this folder keeps exactly one dependency, and an argument
 * parser is not worth a second.
 */
import { loadQaEnv } from "./env.js";
import { closeDb } from "./db.js";
import { readFunnel, type Funnel } from "./config/read.js";
import { preflight, renderGuard } from "./guard.js";
import { exitLabel } from "../../src/features/assessment/schemas.js";

interface Args {
  slug: string;
  audit: boolean;
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

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadQaEnv();

  if (!args.slug) {
    console.log("Usage: npm run qa -- --slug=<funnel-slug> [--audit] [--headed] [--only=gate,routes,bands] [--case=<id>]");
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
    console.log("\nAudit only, nothing was driven.");
    return 0;
  }

  console.log("\nThe browser layer is not wired yet. Run with --audit for now.");
  return 0;
}

main()
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
    await closeDb();
    process.exit(1);
  });
