"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const CONNECTOR_VERSION = "v4";

/**
 * Generates a SINGLE self-contained block the customer pastes above their video.
 * It is one piece on purpose: the old two-part (head + body) split kept getting
 * mismatched on the destination page. This block has its own empty target div
 * (invisible until filled — no display:none) plus an inline script that reads the
 * ?t token, fetches /api/r/:token, and injects the saved AI statement.
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

  const snippet = buildSnippet(endpointBase.replace(/\/+$/, ""));

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal pl-5 text-sm text-[var(--muted-foreground)]">
        <li>Paste this <strong>one block</strong> on your destination page, right <strong>above your video</strong>.</li>
        <li>That&apos;s it — no <span className="font-mono">&lt;head&gt;</span> edit, no second snippet.</li>
        <li>It stays blank until a result loads. To confirm it&apos;s the latest, open your page&apos;s browser Console — you should see <span className="font-mono">[assess360] connector {CONNECTOR_VERSION} active</span>.</li>
      </ol>
      <CodeBlock title={`Paste above your video (connector ${CONNECTOR_VERSION})`} code={snippet} />
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

function buildSnippet(endpointBase: string): string {
  return `<!-- assess360 ${CONNECTOR_VERSION} — paste this whole block above your video -->
<div id="ai-statement" style="white-space:pre-line"></div>
<script>
(function () {
  console.log("[assess360] connector ${CONNECTOR_VERSION} active");
  var ENDPOINT_BASE = "${endpointBase}";
  var t = new URLSearchParams(location.search).get("t");
  if (!t) return; // blank in the page builder (no token)
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
    if (el && stmt != null) el.textContent = String(stmt);
  }
  function go() { load().then(show).catch(function () {}); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();
</script>`;
}
