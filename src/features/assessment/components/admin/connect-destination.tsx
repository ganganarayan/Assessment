"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const CONNECTOR_VERSION = "v6";

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

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal pl-5 text-sm text-[var(--muted-foreground)]">
        <li>Paste <strong>Part A</strong> in the page&apos;s <span className="font-mono">&lt;head&gt;</span> (head/custom-code section — this is where scripts run).</li>
        <li>Paste <strong>Part B</strong> in the page <strong>body, right above your video</strong> (it&apos;s plain HTML).</li>
        <li>Both stay blank until a result loads. To confirm, open the page&apos;s browser Console — you should see <span className="font-mono">[assess360] connector {CONNECTOR_VERSION} active</span>. Re-copy <strong>both</strong> whenever you change settings.</li>
      </ol>
      <CodeBlock title={`Part A — paste in <head> (connector ${CONNECTOR_VERSION})`} code={partA} />
      <CodeBlock title="Part B — paste in body, above your video" code={partB} />
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
  function show(d) {
    var stmt = d.aiStatement || d.resultSuggestion || d.resultBand;
    var el = document.getElementById("ai-statement");
    if (!el) { console.warn('[assess360] Part B missing — paste <div id="ai-statement"></div> in the page body'); return; }
    if (stmt != null) el.textContent = String(stmt);
  }
  function go() { load().then(show).catch(function () {}); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();
</script>`;
}

function buildBodySnippet(): string {
  // Plain HTML for the body — invisible until the head script fills it.
  return `<!-- assess360 results ${CONNECTOR_VERSION} — paste in body, above your video -->
<div id="ai-statement" style="white-space:pre-line"></div>`;
}
