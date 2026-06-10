"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryWebhookLog } from "@/features/events/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface WebhookLogRow {
  id: string;
  eventName: string;
  endpoint: string;
  responseStatus: number | null;
  success: boolean;
  attemptCount: number;
  error: string | null;
  createdAt: string;
  payload: string;
  responseBody: string | null;
  canRetry: boolean;
}

function fmt(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}

export function WebhookLogsTable({ rows }: { rows: WebhookLogRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<WebhookLogRow | null>(null);
  const [pending, start] = useTransition();

  function retry(id: string) {
    start(async () => {
      await retryWebhookLog(id);
      setSelected(null);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No webhook deliveries yet.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Attempts</th>
              <th className="px-3 py-2">Response Code</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelected(r)}
                className="cursor-pointer hover:bg-[var(--muted)]"
              >
                <td className="whitespace-nowrap px-3 py-2 text-xs">{fmt(r.createdAt)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.eventName}</td>
                <td className="px-3 py-2">
                  <Badge variant={r.success ? "success" : "outline"}>
                    {r.success ? "success" : "failed"}
                  </Badge>
                </td>
                <td className="px-3 py-2">{r.attemptCount}</td>
                <td className="px-3 py-2">{r.responseStatus ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto border-l bg-[var(--background)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-mono text-lg font-semibold">{selected.eventName}</h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {fmt(selected.createdAt)} · {selected.endpoint}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm">
              <Badge variant={selected.success ? "success" : "outline"}>
                {selected.success ? "success" : "failed"}
              </Badge>
              <span className="text-[var(--muted-foreground)]">
                code {selected.responseStatus ?? "—"} · attempt {selected.attemptCount}
              </span>
            </div>

            {selected.canRetry ? (
              <div className="mt-3">
                <Button size="sm" onClick={() => retry(selected.id)} disabled={pending}>
                  {pending ? "Retrying…" : "Retry"}
                </Button>
              </div>
            ) : !selected.success ? (
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                Retry unavailable — the webhook for this event is inactive or purged.
              </p>
            ) : null}

            <Section title="Payload" body={selected.payload} />
            <Section title="Response" body={selected.responseBody ?? "(no body)"} />
            {selected.error ? <Section title="Error" body={selected.error} /> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">{title}</p>
      <pre className="max-h-72 overflow-auto rounded-md border bg-[var(--muted)] p-3 text-xs">
        {body}
      </pre>
    </div>
  );
}
