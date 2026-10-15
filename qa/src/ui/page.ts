/**
 * The panel itself. One page, no build step, no framework: it is a few buttons and a
 * log, and anything more would be a second application to maintain beside the one it
 * is supposed to be testing.
 */
export function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Funnel checks</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --muted:#667; --line:#dde;
          --ok:#0a7d32; --warn:#b58900; --bad:#b00020; --accent:#0a7d32; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0e1116; --fg:#e8eaed; --muted:#99a; --line:#242a33; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 ui-sans-serif,system-ui,sans-serif; }
  .wrap { max-width:1060px; margin:0 auto; padding:20px 16px 64px; }
  h1 { font-size:20px; margin:0 0 2px; }
  .target { display:flex; gap:10px; align-items:center; flex-wrap:wrap; font-size:13px; color:var(--muted); margin:0 0 18px; }
  .pill { border:1px solid var(--line); border-radius:999px; padding:2px 10px; }
  .pill.bad { border-color:var(--bad); color:var(--bad); font-weight:700; }
  .pill.ok { border-color:var(--ok); color:var(--ok); }
  .card { border:1px solid var(--line); border-radius:12px; padding:14px 16px; margin:0 0 14px; }
  .card h2 { font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin:0 0 10px; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  button { font:inherit; border:1px solid var(--line); background:transparent; color:var(--fg);
           border-radius:8px; padding:8px 14px; cursor:pointer; }
  button:hover:not(:disabled) { border-color:var(--accent); }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  select { font:inherit; padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--fg); min-width:260px; }
  code { font-size:12px; color:var(--muted); }
  #log { background:color-mix(in srgb, var(--fg) 6%, transparent); border-radius:10px; padding:12px;
         font:12px/1.5 ui-monospace,Consolas,monospace; height:46vh; overflow:auto; white-space:pre-wrap; }
  .status { display:flex; gap:10px; align-items:center; font-size:13px; margin:0 0 8px; }
  .dot { width:9px; height:9px; border-radius:50%; background:var(--muted); }
  .dot.live { background:var(--warn); animation:pulse 1s infinite; }
  .dot.ok { background:var(--ok); } .dot.bad { background:var(--bad); }
  @keyframes pulse { 50% { opacity:.3; } }
  a { color:var(--accent); }
</style>
</head>
<body><div class="wrap">
  <h1>Funnel checks</h1>
  <div class="target">
    <span id="target" class="pill">checking…</span>
    <span id="db" class="pill">database…</span>
    <span id="tally" class="pill" hidden></span>
    <a id="report" href="#" target="_blank" hidden>open the last report</a>
  </div>

  <div class="card">
    <h2>One funnel</h2>
    <div class="row">
      <select id="slug"></select>
      <button data-job="plan">Plan</button>
      <button data-job="audit">Audit</button>
      <button data-job="run" class="primary">Run</button>
      <button data-job="watch">Watch it</button>
      <button data-job="abandon">Settle abandonment</button>
      <button data-job="cleanup">Clean up its rows</button>
    </div>
    <p><code id="cmd-one">&nbsp;</code></p>
  </div>

  <div class="card">
    <h2>Everything</h2>
    <div class="row">
      <button data-job="all" class="primary">Run all test funnels</button>
      <button data-job="seed">Seed test funnels</button>
      <button data-job="unseed">Remove them</button>
      <button data-job="setup">Install the browser</button>
      <button id="stop">Stop</button>
    </div>
    <p><code>npm run qa:all&nbsp; · &nbsp;npm run qa:seed&nbsp; · &nbsp;npx playwright install chromium</code></p>
  </div>

  <div class="card">
    <div class="status"><span id="dot" class="dot"></span><span id="state">idle</span></div>
    <div id="log"></div>
  </div>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  const log = $("log");
  let busy = false;

  function write(text) {
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
    log.textContent += text;
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  function setBusy(on, label) {
    busy = on;
    document.querySelectorAll("button[data-job]").forEach((b) => (b.disabled = on));
    $("dot").className = "dot" + (on ? " live" : "");
    $("state").textContent = label;
  }

  async function refresh() {
    const s = await fetch("/api/state").then((r) => r.json());
    $("target").textContent = s.baseUrl.replace(/^https?:\\/\\//, "");
    $("target").className = "pill " + (s.looksLikeProd ? "bad" : "ok");
    $("db").textContent = s.hasDatabase ? "database connected" : "no database - start under railway run";
    $("db").className = "pill " + (s.hasDatabase ? "ok" : "bad");
    const sel = $("slug");
    if (sel.options.length === 0) {
      for (const f of s.funnels) {
        const o = document.createElement("option");
        o.value = f.slug;
        o.textContent = f.title + "  (" + f.slug + ")";
        sel.appendChild(o);
      }
      showCommand();
    }
    if (s.report) { $("report").hidden = false; $("report").href = s.report; }
    if (s.tally) {
      $("tally").hidden = false;
      $("tally").textContent = s.tally.pass + " passed, " + s.tally.fail + " failed";
      $("tally").className = "pill " + (s.tally.fail > 0 ? "bad" : "ok");
    }
    if (s.looksLikeProd) {
      document.querySelectorAll("button[data-job]").forEach((b) => (b.disabled = true));
      $("state").textContent = "the target is not staging - runs are blocked";
    }
  }

  function showCommand(job) {
    const slug = $("slug").value || "<funnel>";
    const map = {
      plan: "npm run qa -- --slug=" + slug + " --plan",
      audit: "npm run qa -- --slug=" + slug + " --audit",
      run: "npm run qa -- --slug=" + slug,
      watch: "npm run qa -- --slug=" + slug + " --headed --slow=250",
      abandon: "npm run qa:abandon -- --slug=" + slug,
      cleanup: "npm run qa -- --slug=" + slug + " --cleanup",
    };
    $("cmd-one").textContent = map[job] ?? map.run;
  }

  $("slug").addEventListener("change", () => showCommand());

  document.querySelectorAll("button[data-job]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (busy) return;
      const job = btn.dataset.job;
      showCommand(job);
      const slug = $("slug").value ?? "";
      log.textContent = "";
      setBusy(true, job + " running…");
      const es = new EventSource("/api/run?job=" + encodeURIComponent(job) + "&slug=" + encodeURIComponent(slug));
      es.addEventListener("started", (e) => write("> " + JSON.parse(e.data).command + "\\n\\n"));
      es.addEventListener("out", (e) => write(JSON.parse(e.data)));
      es.addEventListener("done", (e) => {
        const d = JSON.parse(e.data);
        es.close();
        setBusy(false, d.code === 0 ? "finished" : "finished with failures");
        $("dot").className = "dot " + (d.code === 0 ? "ok" : "bad");
        refresh();
      });
      es.onerror = () => { es.close(); setBusy(false, "stopped"); refresh(); };
    });
  });

  $("stop").addEventListener("click", () => fetch("/api/stop").then(() => setBusy(false, "stopped")));
  refresh();
</script>
</body></html>`;
}
