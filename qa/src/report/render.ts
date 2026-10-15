/**
 * The two outputs: a table you read while it runs, and a page you read afterwards.
 *
 * The page is one self-contained file with no assets, because a report that needs a
 * server to look at is a report nobody opens. Every failed check carries what was
 * expected, what happened, and the trail of what the browser actually did, so a
 * failure can be argued about without re-running it.
 */
import { writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import type { SweepResult, CaseResult } from "../sweep.js";
import type { Check } from "../assert/compare.js";

const DOT: Record<string, string> = { pass: "🟢", fail: "🟡", warn: "🟠", skip: "⚪" };

export function renderTerminal(r: SweepResult): string {
  const lines: string[] = [];
  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const c of r.results) counts[c.verdict] += 1;

  lines.push("");
  lines.push(`Results for ${r.slug} on ${r.baseUrl}`);
  lines.push("");
  for (const c of r.results) {
    lines.push(`${DOT[c.verdict] ?? "?"} ${c.id}`);
    lines.push(`   ${c.title}`);
    if (c.unreachable) lines.push(`   unreachable: ${c.unreachable}`);
    for (const check of c.checks) {
      if (check.verdict === "pass") continue;
      lines.push(`   ${check.verdict.toUpperCase()}: ${check.what}`);
      if (check.expected !== undefined) lines.push(`      expected ${check.expected}`);
      if (check.observed !== undefined) lines.push(`      observed ${check.observed}`);
    }
  }
  if (r.admin) {
    lines.push("");
    lines.push("Admin screens");
    if (!r.admin.ran) lines.push(`   skipped: ${r.admin.why ?? ""}`);
    for (const check of r.admin.checks) {
      lines.push(`   ${check.verdict.toUpperCase()}: ${check.what}`);
      if (check.observed !== undefined) lines.push(`      observed ${check.observed}`);
    }
  }
  lines.push("");
  lines.push(
    `${counts.pass} passed, ${counts.fail} failed, ${counts.warn} with warnings, ${counts.skip} skipped, in ${r.seconds}s`,
  );
  lines.push(`Report: ${join(r.outDir, "index.html")}`);
  return lines.join("\n");
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function checkRows(checks: Check[]): string {
  return checks
    .map(
      (c) => `<tr class="${c.verdict}">
      <td class="v">${esc(c.verdict)}</td>
      <td>${esc(c.what)}</td>
      <td>${esc(c.expected ?? "")}</td>
      <td>${esc(c.observed ?? "")}</td>
    </tr>`,
    )
    .join("\n");
}

function caseSection(c: CaseResult): string {
  const failed = c.checks.filter((x) => x.verdict !== "pass").length;
  const obs = c.observation;
  const exp = c.expectation;
  return `<details class="case ${c.verdict}" ${c.verdict === "fail" ? "open" : ""}>
  <summary>
    <span class="dot">${DOT[c.verdict] ?? "?"}</span>
    <code>${esc(c.id)}</code>
    <span class="title">${esc(c.title)}</span>
    <span class="meta">${failed ? `${failed} to look at` : "all clear"} · ${c.seconds}s</span>
  </summary>
  ${c.unreachable ? `<p class="unreachable">Unreachable: ${esc(c.unreachable)}</p>` : ""}
  <table>
    <thead><tr><th>Verdict</th><th>Statement</th><th>Expected</th><th>Observed</th></tr></thead>
    <tbody>${checkRows(c.checks)}</tbody>
  </table>
  <div class="grid">
    <div>
      <h4>What the funnel should have done</h4>
      <pre>${esc(JSON.stringify(exp, null, 2))}</pre>
    </div>
    <div>
      <h4>What the browser did</h4>
      <pre>${esc((obs?.trail ?? []).join("\n"))}</pre>
      <h4>Screens</h4>
      <pre>${esc((obs?.steps ?? []).join(" -> "))}</pre>
      ${
        c.retakeObservation
          ? `<h4>The second run, as the same person</h4><pre>${esc(c.retakeObservation.trail.join("\n"))}</pre><pre>${esc(c.retakeObservation.steps.join(" -> "))}</pre>`
          : ""
      }
      <h4>Rows read back</h4>
      <pre>${esc(JSON.stringify(c.rows, null, 2))}</pre>
      <h4>Event firings during this case</h4>
      <pre>${esc(JSON.stringify(Object.fromEntries(c.events ?? []), null, 2))}</pre>
      <p class="meta">identity: ${esc(c.identityEmail ?? "")}</p>
    </div>
  </div>
  ${c.screenshotPath ? `<p><img src="${esc(basename(c.screenshotPath))}" alt="the last screen" /></p>` : ""}
  ${c.tracePath ? `<p class="meta">trace: <code>npx playwright show-trace ${esc(basename(c.tracePath))}</code></p>` : ""}
</details>`;
}

/** The tally, for anything that runs sweeps and needs the answer rather than the page. */
export function writeResultJson(r: SweepResult): string {
  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const c of r.results) counts[c.verdict] += 1;
  const path = join(r.outDir, "result.json");
  writeFileSync(
    path,
    JSON.stringify({ slug: r.slug, runId: r.runId, seconds: r.seconds, cases: r.results.length, ...counts }, null, 2),
    "utf8",
  );
  return path;
}

export function writeHtml(r: SweepResult): string {
  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const c of r.results) counts[c.verdict] += 1;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(r.slug)} verification</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --muted:#667; --line:#dde; --pass:#0a7d32; --fail:#b58900; --warn:#c2410c; --skip:#889; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0e1116; --fg:#e8eaed; --muted:#99a; --line:#242a33; } }
  body { margin:0; padding:24px 16px 64px; background:var(--bg); color:var(--fg); font:15px/1.5 ui-sans-serif,system-ui,sans-serif; }
  .wrap { max-width:1040px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 20px; }
  .tally { display:flex; gap:16px; flex-wrap:wrap; margin:0 0 24px; padding:12px 16px; border:1px solid var(--line); border-radius:10px; }
  .tally b { font-size:20px; display:block; }
  .case { border:1px solid var(--line); border-radius:10px; padding:10px 14px; margin:0 0 10px; }
  .case.fail { border-color:var(--fail); }
  summary { cursor:pointer; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
  summary code { font-size:13px; }
  .title { flex:1 1 320px; }
  .meta { color:var(--muted); font-size:13px; }
  table { width:100%; border-collapse:collapse; margin:12px 0; font-size:14px; }
  th,td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  td.v { text-transform:uppercase; font-size:12px; letter-spacing:.04em; }
  tr.pass td.v { color:var(--pass); } tr.fail td.v { color:var(--fail); font-weight:700; }
  tr.warn td.v { color:var(--warn); } tr.skip td.v { color:var(--skip); }
  .grid { display:grid; grid-template-columns:1fr; gap:16px; }
  @media (min-width:860px) { .grid { grid-template-columns:1fr 1fr; } }
  pre { background:color-mix(in srgb, var(--fg) 6%, transparent); padding:10px; border-radius:8px; overflow:auto; font-size:12px; max-height:340px; }
  h4 { margin:12px 0 4px; font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  img { max-width:100%; border:1px solid var(--line); border-radius:8px; }
  .unreachable { color:var(--warn); }
</style>
</head>
<body><div class="wrap">
<h1>${esc(r.slug)}</h1>
<p class="sub">${esc(r.baseUrl)} · run ${esc(r.runId)} · ${esc(r.startedAt)} · ${r.seconds}s</p>
<div class="tally">
  <div><b>${counts.pass}</b> passed</div>
  <div><b>${counts.fail}</b> failed</div>
  <div><b>${counts.warn}</b> warnings</div>
  <div><b>${counts.skip}</b> skipped</div>
  <div><b>${r.results.length}</b> cases</div>
</div>
${r.results.map(caseSection).join("\n")}
${
  r.admin
    ? `<details class="case ${r.admin.checks.some((c) => c.verdict === "fail") ? "fail" : "pass"}" open>
  <summary><span class="dot">${r.admin.checks.some((c) => c.verdict === "fail") ? DOT.fail : DOT.pass}</span><span class="title">The same run, seen from the admin screens</span></summary>
  ${r.admin.ran ? "" : `<p class="unreachable">Skipped: ${esc(r.admin.why)}</p>`}
  <table><thead><tr><th>Verdict</th><th>Statement</th><th>Expected</th><th>Observed</th></tr></thead><tbody>${checkRows(r.admin.checks)}</tbody></table>
</details>`
    : ""
}
</div></body></html>`;
  const path = join(r.outDir, "index.html");
  writeFileSync(path, html, "utf8");
  return path;
}
