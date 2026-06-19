"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Generates the copy-paste snippet a customer adds to their destination page so
 * it shows the Assess360 AI result statement. The block is BLANK until results
 * load (so the page builder shows nothing), then the connector pulls the stored
 * statement (which already includes the watch-the-video CTA) and reveals it.
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
  const partA = buildHeaderSnippet(base);
  const partB = buildBodySnippet();

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal pl-5 text-sm text-[var(--muted-foreground)]">
        <li>Paste <strong>Part A</strong> into your page&apos;s <span className="font-mono">&lt;head&gt;</span>.</li>
        <li>Paste <strong>Part B</strong> directly <strong>above your video</strong>. It stays blank until the result loads, then shows the personalized message.</li>
        <li>Put your video (and anything else) below Part B.</li>
      </ol>
      <CodeBlock title="Part A — paste in page header" code={partA} />
      <CodeBlock title="Part B — paste above your video" code={partB} />
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

const CONNECTOR_VERSION = "v3";

function buildHeaderSnippet(endpointBase: string): string {
  return `<!-- assess360 connector ${CONNECTOR_VERSION} — paste the LATEST copy from your admin -->
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
        if (attempts++ < 3) return new Promise(function (res) { setTimeout(res, 600); }).then(load);
        throw e;
      });
  }
  function show(d) {
    var stmt = d.aiStatement || d.resultSuggestion || d.resultBand;
    if (stmt == null) return; // nothing to show -> stays blank
    var el = document.getElementById("ai-statement");
    var box = document.getElementById("assess360-results");
    if (el) el.textContent = String(stmt);
    if (box) box.style.display = "";
  }
  function onReady() { load().then(show).catch(function () {}); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady);
  else onReady();
})();
</script>`;
}

function buildBodySnippet(): string {
  // Blank until the connector injects the saved AI statement (with its CTA).
  return `<!-- assess360 results ${CONNECTOR_VERSION} -->
<div id="assess360-results" style="display:none">
  <p id="ai-statement"></p>
</div>`;
}
