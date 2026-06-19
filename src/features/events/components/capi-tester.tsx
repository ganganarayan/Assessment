"use client";

import { useState, useTransition } from "react";
import { testMetaCapi } from "@/features/events/actions/capi-test";
import { Button } from "@/components/ui/button";

type Result = Awaited<ReturnType<typeof testMetaCapi>>;

export function CapiTester() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setResult(null);
    start(async () => setResult(await testMetaCapi()));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Server-side CAPI test (AssessmentCompleted)</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Sends a real <span className="font-mono">AssessmentCompleted</span> event to Meta
          server-to-server (Conversions API) and shows Meta&apos;s actual response. If this says{" "}
          <span className="font-mono">events_received: 1</span>, the app IS reaching Meta and the
          issue is your custom-conversion rule; any error here is the real cause.
        </p>
      </div>

      <div>
        <Button onClick={run} disabled={pending}>
          {pending ? "Sending…" : "Send test event to Meta"}
        </Button>
      </div>

      {result ? (
        <div className="rounded-md border p-3 text-sm">
          <p className={result.ok ? "font-medium text-green-600" : "font-medium text-red-500"}>
            {result.ok
              ? `✓ Meta accepted it (HTTP ${result.status}) — event "${result.eventName}"`
              : `✗ Failed — event "${result.eventName}"`}
            {result.datasetId ? ` · dataset ${result.datasetId}` : ""}
          </p>
          {result.response ? (
            <pre className="mt-2 max-h-60 overflow-auto rounded bg-[var(--muted)] p-2 text-xs">
              {result.response}
            </pre>
          ) : null}
          {result.error ? <p className="mt-2 text-xs text-red-500">{result.error}</p> : null}
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Then check Events Manager → your dataset → <em>Test Events</em> / Overview for{" "}
            <span className="font-mono">AssessmentCompleted</span>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
