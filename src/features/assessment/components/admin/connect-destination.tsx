"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Generates the copy-paste snippet a customer adds to their destination page so
 * it shows Assess360 results. Assess360 never touches their video/layout — it
 * only ships this contract: #band-score, #band-overall, and per-category
 * [data-cat="<name>"][data-field="band|meaning|score"] placeholders.
 */
export function ConnectDestination({
  targetUrl,
  categories,
  endpointBase,
}: {
  targetUrl: string | null;
  categories: string[];
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
  const partA = buildHeaderSnippet(base);
  const partB = buildBodySnippet(categories);

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal pl-5 text-sm text-[var(--muted-foreground)]">
        <li>Paste <strong>Part A</strong> into your page&apos;s <span className="font-mono">&lt;head&gt;</span>.</li>
        <li>Paste <strong>Part B</strong> in the section where you want the assessment results to show.</li>
        <li>Add your other elements (your VSL video, a calendar, or anything else) below this, in a separate section.</li>
      </ol>
      <CodeBlock title="Part A — paste in page header" code={partA} />
      <CodeBlock
        title="Part B — paste in page body, in the section where you want the assessment results to show"
        code={partB}
      />
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

function buildHeaderSnippet(endpointBase: string): string {
  return `<link rel="preconnect" href="${endpointBase}">
<script>
(function () {
  var ENDPOINT_BASE = "${endpointBase}";
  var t = new URLSearchParams(location.search).get("t");
  if (!t) return;
  var attempts = 0;
  function load() {
    return fetch(ENDPOINT_BASE + "/api/r/" + encodeURIComponent(t))
      .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
      .catch(function (e) {
        if (attempts++ < 3) return new Promise(function (res) { setTimeout(res, 600); }).then(load);
        throw e;
      });
  }
  var dataPromise = load();
  function setText(el, val) { if (el && val != null) el.textContent = String(val); }
  function esc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s; }
  function inject(d) {
    setText(document.getElementById("band-score"), d.scorePercent);
    setText(document.getElementById("band-overall"), d.resultBand);
    setText(document.getElementById("band-suggestion"), d.resultSuggestion);
    (d.categories || []).forEach(function (c) {
      document.querySelectorAll('[data-cat="' + esc(c.name) + '"]').forEach(function (el) {
        var f = el.getAttribute("data-field");
        if (f === "band") setText(el, c.band);
        else if (f === "meaning") setText(el, c.meaning);
        else if (f === "score") setText(el, c.score);
      });
    });
    var cover = document.getElementById("eval-state");
    if (cover) cover.style.display = "none";
  }
  function onReady() {
    dataPromise.then(inject).catch(function () {
      var cover = document.getElementById("eval-state");
      if (cover) cover.textContent = "We couldn't load your results. Please refresh.";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady);
  else onReady();
})();
</script>`;
}

// Escape for HTML text + double-quoted attribute. The browser decodes the
// attribute back to the raw name, so the connector's CSS.escape selector still
// matches — but the generated markup is safe and well-formed.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildBodySnippet(categories: string[]): string {
  const cats = categories.length
    ? categories
        .map((name) => {
          const e = escapeHtml(name);
          return `  <div class="assess360-category">
    <h3>${e}</h3>
    <p><strong data-cat="${e}" data-field="band"></strong></p>
    <p data-cat="${e}" data-field="meaning"></p>
  </div>`;
        })
        .join("\n")
    : "  <!-- (this assessment has no categories yet) -->";

  return `<div id="assess360-results">
  <div id="eval-state">Evaluating your results…</div>

  <p>Overall: <span id="band-overall"></span></p>
  <p id="band-suggestion"></p>

${cats}
</div>`;
}
