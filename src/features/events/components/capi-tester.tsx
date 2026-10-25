"use client";

import { useState, useTransition } from "react";
import { testMetaCapi } from "@/features/events/actions/capi-test";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isStandardMetaEvent, type EventChoice } from "@/lib/meta/event-catalog";

type Result = Awaited<ReturnType<typeof testMetaCapi>>;

/**
 * `accounts` is the workspace's ad accounts, so the test can be aimed at the one being
 * doubted.
 *
 * 🔴 Why it is not just "the workspace's pixel" any more: this tester resolved the
 * DEFAULT account, so a workspace running two got one green tick for one dataset and
 * read it as proof that every funnel was reporting. The account that cannot be tested is
 * always the one with the problem.
 */
export function CapiTester({
  accounts = [],
  events = [],
}: {
  accounts?: { id: string; label: string; isDefault: boolean }[];
  /**
   * Every event name this workspace can send, built by the page from the funnel's own
   * table and the names actually configured on its booking types and funnels.
   *
   * A list rather than a `<select>`, and the field stays an ordinary text input, because
   * both halves are needed: nobody remembers whether it is GateQualified or the
   * GatePassed it was renamed from, and a test that can only send names the app already
   * knows cannot register a NEW conversion in Events Manager, which is half of what this
   * page is for.
   */
  events?: EventChoice[];
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [code, setCode] = useState("");
  const [eventName, setEventName] = useState("AssessmentCompleted");
  const [adAccountId, setAdAccountId] = useState("");
  const [pending, start] = useTransition();

  function run() {
    setResult(null);
    start(async () => setResult(await testMetaCapi(code, eventName, adAccountId)));
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
          THIS environment - it&apos;s set on prod, not staging.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {accounts.length > 1 ? (
          <select
            className="h-10 rounded-md border border-[var(--input)] bg-[var(--background)] px-3 text-sm sm:w-56"
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
          >
            <option value="">
              Default account
              {accounts.find((a) => a.isDefault) ? ` (${accounts.find((a) => a.isDefault)?.label})` : ""}
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        ) : null}
        <Input
          className="sm:w-56"
          list={events.length ? "capi-event-names" : undefined}
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="Event name (e.g. Purchase121)"
        />
        {events.length ? (
          <datalist id="capi-event-names">
            {events.map((e) => (
              <option key={e.name} value={e.name} label={`${e.name} - ${e.note}`} />
            ))}
          </datalist>
        ) : null}
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
      {events.length ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          The event field lists every name this workspace sends - the funnel&apos;s own events, each
          booking type&apos;s four moments and each funnel&apos;s payment event. Type over it to register
          a new one.{" "}
          <span className="font-mono">{eventName.trim() || "(empty)"}</span> is{" "}
          {isStandardMetaEvent(eventName)
            ? "a Meta standard event."
            : "a custom event, which is fine for the Conversions API."}
        </p>
      ) : null}

      {result ? (
        <div className="rounded-md border p-3 text-sm">
          <p className={result.ok ? "font-medium text-green-600" : "font-medium text-red-500"}>
            {result.ok
              ? `✓ Meta accepted it (HTTP ${result.status}) - event "${result.eventName}"`
              : `✗ Failed - event "${result.eventName}"`}
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
