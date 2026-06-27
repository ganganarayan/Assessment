"use client";

import { useState, useTransition } from "react";
import { testMetaCapi } from "@/features/events/actions/capi-test";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = Awaited<ReturnType<typeof testMetaCapi>>;

export function CapiTester() {
  const [result, setResult] = useState<Result | null>(null);
  const [code, setCode] = useState("");
  const [eventName, setEventName] = useState("AssessmentCompleted");
  const [pending, start] = useTransition();

  function run() {
    setResult(null);
    start(async () => setResult(await testMetaCapi(code, eventName)));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Server-side CAPI test</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Sends a real server-to-server (Conversions API) event to Meta and shows Meta&apos;s actual
          response. If this says <span className="font-mono">events_received: 1</span>, the app IS
          reaching Meta. Set the event name to <span className="font-mono">Purchase121</span> to test
          that conversion (value 1, INR). Needs <span className="font-mono">META_CAPI_ACCESS_TOKEN</span> on
          THIS environment — it&apos;s set on prod, not staging.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          className="sm:w-56"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="Event name (e.g. Purchase121)"
        />
        <Input
          className="sm:w-64"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Test Events code (optional)"
        />
        <Button onClick={run} disabled={pending}>
          {pending ? "Sending…" : "Send test event to Meta"}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Paste the code from Events Manager → your dataset → <em>Test Events</em> to watch this
        event arrive there live (it won&apos;t count as a real conversion). Leave blank to send a
        normal event.
      </p>

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
            <span className="font-mono">{result.eventName}</span>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
