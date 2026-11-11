/**
 * AI result-statement eval: the same real respondents, the same prompts, every model.
 *
 *   railway run --environment <env> --service Assessment npm run qa:ai-eval -- [flags]
 *
 * READ-ONLY against the database: it reads N recent real completions of one funnel
 * (preview rows excluded), the tenant's live prompt and its saved Claude key. It writes
 * nothing to the app. Every model call goes straight to Anthropic with the request
 * shape the app uses, and every response is recorded with its real token usage and
 * cost, then scored by the deterministic checks in score.ts and, unless --no-judge,
 * by a judge model that must quote the sentence behind each verdict.
 *
 * Flags:
 *   --slug=<funnel>        default: the funnel with the most AI statements in 120 days
 *   --cases=10             real respondents, spread across bands
 *   --models=a,b,c         default: the five below
 *   --runs=2               runs per case for the precise prompt (consistency)
 *   --live-runs=1          runs per case for the tenant's live prompt
 *   --max-tokens=4000      per call; outputs over 900 are flagged (the app's limit today)
 *   --no-judge             skip the judge pass
 *   --reuse                reuse the cached cases file instead of reading the DB again
 *
 * The report lands in qa/reports/ai-eval-<time>/ (gitignored: it holds respondents' answers).
 */
import "../../../scripts/public-db-url.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../../src/lib/db/prisma.js";
import { getAiConfig } from "../../../src/lib/ai/generate.js";
import { resolvePromptVersion, getWordWindow } from "../../../src/lib/ai/versions.js";
import { instructionVersion, type PromptVersion } from "../../../src/lib/ai/prompt-versions.js";
import { buildStatementMessages } from "../../../src/lib/ai/prompt.js";
import { getSubmissionQuestionBreakdown } from "../../../src/features/admin/data/submission-questions.js";
import type { ResultSnapshot } from "../../../src/lib/result/snapshot.js";
import type { StatementInput } from "../../../src/lib/ai/types.js";
import { QA_ROOT } from "../env.js";
import { scoreStatement, sharedRuns, wordCount, type CheckResult } from "./score.js";
import { judgeStatement, type JudgeVerdict } from "./judge.js";

/** USD per million tokens, Anthropic list prices (claude-api reference, cached 03-11-2026). */
const RATES: Record<string, { inp: number; out: number }> = {
  "claude-haiku-4-5": { inp: 1, out: 5 },
  "claude-haiku-5-5": { inp: 0.1, out: 0.5 },
  "claude-sonnet-5": { inp: 2, out: 10 },
  "claude-sonnet-5-5": { inp: 2, out: 10 },
  "claude-opus-5-5": { inp: 4, out: 20 },
};
const DEFAULT_MODELS = ["claude-sonnet-5", "claude-haiku-4-5", "claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
const APP_MAX_TOKENS = 900;

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

interface EvalCase {
  id: string;
  input: StatementInput;
  liveStatement: string | null;
}

interface Row {
  caseId: string;
  bandLevel: string | null;
  prompt: "live" | "precise";
  model: string;
  run: number;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ms: number;
  words: number;
  text: string;
  error?: string;
  checks: CheckResult[];
  judge?: JudgeVerdict;
}

async function loadCases(slugArg: string | undefined, n: number) {
  const funnel = slugArg
    ? await prisma.assessment.findUnique({ where: { slug: slugArg }, select: { id: true, slug: true, title: true, tenantId: true, aiPromptVersionId: true } })
    : await (async () => {
        const top = await prisma.$queryRawUnsafe<Array<{ slug: string }>>(
          `select a.slug from "submission" s join "assessment" a on a.id = s."assessmentId"
            where s.status = 'COMPLETED' and s."isPreview" = false and s."aiStatement" is not null
              and s."createdAt" > now() - interval '120 days'
            group by a.slug order by count(*) desc limit 1`,
        );
        const slug = top[0]?.slug;
        return slug ? prisma.assessment.findUnique({ where: { slug }, select: { id: true, slug: true, title: true, tenantId: true, aiPromptVersionId: true } }) : null;
      })();
  if (!funnel) throw new Error("No funnel found with AI statements.");

  const subs = await prisma.submission.findMany({
    where: { assessmentId: funnel.id, status: "COMPLETED", isPreview: false, aiStatement: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 120,
    select: { id: true, leadFirstName: true, leadProfession: true, resultSnapshot: true, aiStatement: true },
  });
  // Round-robin across bands so a calm result and a critical one are both in the set.
  const byBand = new Map<string, typeof subs>();
  for (const s of subs) {
    const snap = s.resultSnapshot as unknown as ResultSnapshot | null;
    if (!snap) continue;
    const k = snap.resultBandLevel ?? snap.resultBand ?? "?";
    byBand.set(k, [...(byBand.get(k) ?? []), s]);
  }
  const picked: typeof subs = [];
  while (picked.length < n && [...byBand.values()].some((l) => l.length > 0)) {
    for (const l of byBand.values()) {
      const s = l.shift();
      if (s && picked.length < n) picked.push(s);
    }
  }
  const cases: EvalCase[] = [];
  for (const s of picked) {
    const snap = s.resultSnapshot as unknown as ResultSnapshot;
    const breakdown = await getSubmissionQuestionBreakdown(s.id);
    const qByCat = new Map(breakdown.map((b) => [b.name, b.questions]));
    cases.push({
      id: s.id,
      liveStatement: s.aiStatement,
      input: {
        firstName: s.leadFirstName,
        profession: s.leadProfession,
        assessmentTitle: funnel.title,
        scoreRaw: snap.scoreRaw,
        max: snap.max,
        percentage: snap.scorePercent,
        band: snap.resultBand,
        bandLevel: snap.resultBandLevel ?? null,
        categories: snap.categories.map((c) => ({
          name: c.name, score: c.score, max: c.max, band: c.band, meaning: c.meaning, questions: qByCat.get(c.name) ?? [],
        })),
      },
    });
  }
  return { funnel, cases };
}

async function callClaude(apiKey: string, model: string, maxTokens: number, system: string, user: string) {
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = await res.text();
  const ms = Date.now() - t0;
  if (!res.ok) return { ms, error: `${res.status} ${body.slice(0, 300)}`, text: "", stopReason: null, inputTokens: 0, outputTokens: 0 };
  const data = JSON.parse(body) as {
    stop_reason?: string;
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    ms,
    text: (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim(),
    stopReason: data.stop_reason ?? null,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) await fn(items[i++] as T);
  }));
}

const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((100 * n) / d)}%`);

async function main() {
  const nCases = Number(arg("cases", "10"));
  const runs = Number(arg("runs", "2"));
  const liveRuns = Number(arg("live-runs", "1"));
  const maxTokens = Number(arg("max-tokens", "4000"));
  const models = (arg("models") ?? DEFAULT_MODELS.join(",")).split(",").map((m) => m.trim()).filter(Boolean);
  const useJudge = arg("no-judge") !== "true";
  const cacheFile = join(QA_ROOT, "reports", "ai-eval-cases.json");

  let funnel: { slug: string; title: string; tenantId: string | null; aiPromptVersionId: string | null };
  let cases: EvalCase[];
  if (arg("reuse") === "true" && existsSync(cacheFile)) {
    ({ funnel, cases } = JSON.parse(readFileSync(cacheFile, "utf8")) as { funnel: typeof funnel; cases: EvalCase[] });
  } else {
    ({ funnel, cases } = await loadCases(arg("slug"), nCases));
    mkdirSync(join(QA_ROOT, "reports"), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ funnel, cases }, null, 2));
  }

  const cfg = await getAiConfig(funnel.tenantId);
  if (!cfg || cfg.provider !== "claude") throw new Error("The funnel's tenant has no enabled Claude key.");
  const liveVersion = await resolvePromptVersion(funnel.aiPromptVersionId ?? cfg.promptVersion, funnel.tenantId);
  if (!liveVersion) throw new Error("No live prompt version resolved.");
  const words = await getWordWindow(funnel.tenantId);
  const preciseText = readFileSync(join(QA_ROOT, "src", "ai-eval", "prompts", "v6-precise.txt"), "utf8");
  const precise: PromptVersion = instructionVersion({ id: "v6-precise", label: "V6 precise", instructions: preciseText });
  console.log(`funnel=${funnel.slug} cases=${cases.length} liveModel=${cfg.model} livePrompt=${liveVersion.label} words=${words.min}-${words.max}`);

  const jobs: Array<{ c: EvalCase; prompt: "live" | "precise"; version: PromptVersion; model: string; run: number }> = [];
  for (const c of cases)
    for (const model of models) {
      for (let r = 1; r <= liveRuns; r++) jobs.push({ c, prompt: "live", version: liveVersion, model, run: r });
      for (let r = 1; r <= runs; r++) jobs.push({ c, prompt: "precise", version: precise, model, run: r });
    }

  let rows: Row[] = [];
  let done = 0;
  const rescore = arg("rescore");
  if (rescore) {
    // Re-apply the checks (and the judge) to RECORDED responses: no new generation, so a
    // fix to a check is measured on exactly the same texts.
    const prev = JSON.parse(readFileSync(join(QA_ROOT, "reports", rescore, "rows.json"), "utf8")) as { rows: Row[] };
    const byId = new Map(cases.map((c) => [c.id, c]));
    rows = prev.rows;
    await pool(rows, 5, async (row) => {
      const c = byId.get(row.caseId);
      if (!c) return;
      row.checks = scoreStatement(row.text, c.input, { minWords: 70, maxWords: 100, stopReason: row.stopReason });
      if (useJudge && row.text) row.judge = await judgeStatement(cfg.apiKey, c.input, row.text);
      done++;
      if (done % 25 === 0 || done === rows.length) console.log(`  rescored ${done}/${rows.length}`);
    });
  }
  if (!rescore) await pool(jobs, 5, async (j) => {
    const { system, user } = buildStatementMessages({ ...j.c.input, guidance: null }, j.version, words);
    const r = await callClaude(cfg.apiKey, j.model, maxTokens, system, user);
    const rate = RATES[j.model] ?? { inp: 0, out: 0 };
    const row: Row = {
      caseId: j.c.id,
      bandLevel: j.c.input.bandLevel ?? null,
      prompt: j.prompt,
      model: j.model,
      run: j.run,
      stopReason: r.stopReason,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: (r.inputTokens * rate.inp + r.outputTokens * rate.out) / 1e6,
      ms: r.ms,
      words: wordCount(r.text),
      text: r.text,
      error: r.error,
      checks: scoreStatement(r.text, j.c.input, { minWords: 70, maxWords: 100, stopReason: r.stopReason }),
    };
    if (useJudge && r.text) row.judge = await judgeStatement(cfg.apiKey, j.c.input, r.text);
    rows.push(row);
    done++;
    if (done % 10 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
  });

  // Stock lines reused across DIFFERENT people, per model and prompt.
  const reuse = new Map<string, number>();
  for (const a of rows)
    for (const b of rows)
      if (a.model === b.model && a.prompt === b.prompt && a.caseId < b.caseId && a.run === 1 && b.run === 1 && sharedRuns(a.text, b.text).length > 0)
        reuse.set(`${a.model}|${a.prompt}`, (reuse.get(`${a.model}|${a.prompt}`) ?? 0) + 1);

  const outDir = join(QA_ROOT, "reports", `ai-eval-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "rows.json"), JSON.stringify({ funnel, liveModel: cfg.model, livePrompt: liveVersion.label, words, rows }, null, 2));

  const lines: string[] = [];
  lines.push(`# AI statement eval, ${funnel.slug}`, "", `Live: ${cfg.model} on "${liveVersion.label}". ${cases.length} real respondents. Raw output scored, before the app strips dashes.`, "");
  const checkIds = rows[0]?.checks.map((c) => [c.id, c.label] as const) ?? [];
  lines.push(`| Model | Prompt | n | All code checks | ${checkIds.map(([, l]) => l).join(" | ")} | Judge clean | Over 900 tokens | Avg words | Avg cost (USD) | Avg time (s) | Stock lines reused |`);
  lines.push(`|${" --- |".repeat(10 + checkIds.length)}`);
  for (const model of models)
    for (const prompt of ["live", "precise"] as const) {
      const rs = rows.filter((r) => r.model === model && r.prompt === prompt);
      if (rs.length === 0) continue;
      const allPass = rs.filter((r) => r.checks.every((c) => c.pass)).length;
      const per = checkIds.map(([id]) => pct(rs.filter((r) => r.checks.find((c) => c.id === id)?.pass).length, rs.length));
      const judged = rs.filter((r) => r.judge);
      const jClean = judged.filter((r) => r.judge && r.judge.clean).length;
      const over = rs.filter((r) => r.outputTokens > APP_MAX_TOKENS).length;
      const avg = (f: (r: Row) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
      lines.push(`| ${model} | ${prompt} | ${rs.length} | ${pct(allPass, rs.length)} | ${per.join(" | ")} | ${pct(jClean, judged.length)} | ${over} | ${Math.round(avg((r) => r.words))} | ${avg((r) => r.costUsd).toFixed(4)} | ${(avg((r) => r.ms) / 1000).toFixed(1)} | ${reuse.get(`${model}|${prompt}`) ?? 0} |`);
    }
  lines.push("", "## Every response", "");
  for (const c of cases) {
    const name = c.input.firstName ?? "";
    const redact = (s: string) => (name ? s.split(name).join("[Name]") : s);
    lines.push(`### Case ${c.id.slice(-6)}: ${c.input.bandLevel} ${c.input.scoreRaw}/${c.input.max}`, "");
    if (c.liveStatement) lines.push(`Stored live statement: ${redact(c.liveStatement).replace(/\n+/g, " ")}`, "");
    for (const r of rows.filter((x) => x.caseId === c.id).sort((a, b) => (a.model + a.prompt + a.run).localeCompare(b.model + b.prompt + b.run))) {
      const fails = r.checks.filter((x) => !x.pass).map((x) => `${x.label}${x.detail ? ` (${x.detail})` : ""}`);
      const jf = r.judge && !r.judge.clean ? ` Judge: ${r.judge.issues.map((i) => `${i.rule}: "${i.quote}"`).join("; ")}` : "";
      lines.push(`- **${r.model} / ${r.prompt} / run ${r.run}** (${r.words} words, ${r.outputTokens} out tokens, $${r.costUsd.toFixed(4)}): ${redact(r.text || r.error || "").replace(/\n+/g, " ")}`);
      if (fails.length || jf) lines.push(`  - Fails: ${fails.join("; ") || "none"}.${jf}`);
    }
    lines.push("");
  }
  writeFileSync(join(outDir, "report.md"), lines.join("\n"));
  console.log(`report: ${outDir}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : String(e));
  await prisma.$disconnect();
  process.exit(1);
});
