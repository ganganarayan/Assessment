"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const CONNECTOR_VERSION = "v10";

/**
 * Two snippets, because the customer's page builder runs scripts ONLY in the
 * <head> and the body accepts HTML only:
 *   - Part A (HEAD): the connector <script> — reads ?t, fetches /api/r/:token,
 *     and fills #ai-statement (waits for DOMContentLoaded so the body exists).
 *   - Part B (BODY): a plain empty <div id="ai-statement"> — invisible until the
 *     head script fills it. No display:none / no reveal step, so the two pieces
 *     can't get out of sync.
 */
export function ConnectDestination({
  targetUrl,
  endpointBase,
}: {
  targetUrl: string | null;
  endpointBase: string;
}) {
  if (!targetUrl) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Set a <strong>Destination page URL</strong> above and save — then your copy-paste
        connector code will appear here.
      </p>
    );
  }

  const base = endpointBase.replace(/\/+$/, "");
  const partA = buildHeadSnippet(base);
  const partB = buildBodySnippet();
  const partC = buildScoreSnippet();

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal pl-5 text-sm text-[var(--muted-foreground)]">
        <li><strong>First remove any old assess360 code</strong> from the page (old <span className="font-mono">id=&quot;ai-statement&quot;</span> / <span className="font-mono">assess360-results</span> blocks and any <span className="font-mono">{"{%contact.ai_statement%}"}</span> tag) — duplicate pastes get auto-renamed by the builder and break it.</li>
        <li>Paste <strong>Part A</strong> in the page&apos;s <span className="font-mono">&lt;head&gt;</span> (where scripts run).</li>
        <li>Paste <strong>Part B</strong> in the page <strong>body, right above your video</strong> (the AI message).</li>
        <li>Paste <strong>Part C</strong> in the page <strong>body, below your video and CTA button</strong> (the score + category breakdown).</li>
        <li>All parts use classes (not ids), so they survive re-pastes. One fetch fills both B and C — no extra latency. Console shows <span className="font-mono">[assess360] connector {CONNECTOR_VERSION} active</span>.</li>
      </ol>
      <CodeBlock title={`Part A — paste in <head> (connector ${CONNECTOR_VERSION})`} code={partA} />
      <CodeBlock title="Part B — paste in body, above your video" code={partB} />
      <CodeBlock title="Part C — paste in body, below your video + CTA" code={partC} />
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; user can select manually */
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">{title}</p>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-md border bg-[var(--muted)] p-3 text-xs leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function buildHeadSnippet(endpointBase: string): string {
  return `<!-- assess360 connector ${CONNECTOR_VERSION} — paste in the page HEAD -->
<link rel="preconnect" href="${endpointBase}">
<script>
(function () {
  console.log("[assess360] connector ${CONNECTOR_VERSION} active");
  var ENDPOINT_BASE = "${endpointBase}";
  var t = new URLSearchParams(location.search).get("t");
  if (!t) return;
  var attempts = 0;
  function load() {
    return fetch(ENDPOINT_BASE + "/api/r/" + encodeURIComponent(t))
      .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
      .catch(function (e) {
        if (attempts++ < 4) return new Promise(function (res) { setTimeout(res, 800); }).then(load);
        throw e;
      });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fillStatement(d) {
    var stmt = d.aiStatement || d.resultSuggestion || d.resultBand;
    if (stmt == null) return;
    // Target a CLASS (builders don't rename duplicate classes) + any id starting
    // with "ai-statement" (builders auto-suffix duplicate ids to -2, -3, ...).
    var els = document.querySelectorAll('.assess360-ai-statement, [id^="ai-statement"]');
    for (var i = 0; i < els.length; i++) els[i].textContent = String(stmt);
  }
  function fillScore(d) {
    var box = document.querySelectorAll(".assess360-score");
    if (!box.length || d.scoreRaw == null || d.max == null) return;
    var band = d.resultBand
      ? (d.resultBandLevel ? d.resultBand + " (" + d.resultBandLevel + ")" : d.resultBand)
      : (d.resultBandLevel || "");
    // One block: overall on top, then ONE line per category.
    var html =
      '<div class="assess360-score-total" style="font-size:1.2rem;font-weight:700;margin:0 0 .6rem">' +
      "Overall: " + d.scoreRaw + " / " + d.max + " (" + d.scorePercent + "%)" +
      (band ? " — " + esc(band) : "") + "</div>";
    var cats = d.categories || [];
    if (cats.length) {
      html += '<div class="assess360-score-categories">';
      for (var i = 0; i < cats.length; i++) {
        var c = cats[i];
        html +=
          '<div class="assess360-score-row" style="padding:.35rem 0;border-bottom:1px solid rgba(127,127,127,.2)">' +
          esc(c.name) + ": " + c.score + " / " + c.max +
          (c.band ? " (" + esc(c.band) + ")" : "") + "</div>";
      }
      html += "</div>";
    }
    for (var j = 0; j < box.length; j++) box[j].innerHTML = html;
  }
  function show(d) {
    var hasStmt = document.querySelectorAll('.assess360-ai-statement, [id^="ai-statement"]').length;
    var hasScore = document.querySelectorAll(".assess360-score").length;
    if (!hasStmt && !hasScore) {
      console.warn("[assess360] no targets found — paste Part B (above video) and/or Part C (below video)");
    }
    fillStatement(d);
    fillScore(d);
  }
  function go() { load().then(show).catch(function () {}); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();
</script>`;
}

function buildBodySnippet(): string {
  // Class-based (NOT id) so the page builder never renames it on duplicate paste.
  // Invisible until the head script fills it.
  // font-size 1.2rem (your "12") reads well on desktop; edit it here to taste.
  return `<!-- assess360 results ${CONNECTOR_VERSION} — paste in body, above your video -->
<div class="assess360-ai-statement" style="white-space:pre-line;font-size:1.2rem;line-height:1.6"></div>`;
}

function buildScoreSnippet(): string {
  // Class-based placeholder filled by the head script from the SAME single fetch
  // (no extra request). Put it below the video and CTA. Style .assess360-score,
  // .assess360-score-total, .assess360-score-row in your page CSS to taste.
  return `<!-- assess360 score ${CONNECTOR_VERSION} — paste in body, below your video + CTA -->
<div class="assess360-score" style="font-size:1.05rem;line-height:1.6"></div>`;
}
