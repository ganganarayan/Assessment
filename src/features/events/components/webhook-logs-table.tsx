"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventActivityRow } from "@/features/events/types";
import { retryEvent } from "@/features/events/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function fmt(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}

const STATUS: Record<EventActivityRow["deliveryStatus"], { label: string; variant: "success" | "outline" | "muted" }> = {
  delivered: { label: "delivered", variant: "success" },
  failed: { label: "failed", variant: "outline" },
  none: { label: "no delivery", variant: "muted" },
};

export function WebhookLogsTable({ rows }: { rows: EventActivityRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<EventActivityRow | null>(null);
  const [pending, start] = useTransition();

  function retry(id: string) {
    start(async () => {
      await retryEvent(id);
      setSelected(null);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No events yet.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-1.5">Date</th>
              <th className="px-3 py-1.5">Event</th>
              <th className="px-3 py-1.5">Status</th>
              <th className="px-3 py-1.5">Attempts</th>
              <th className="px-3 py-1.5">Response Code</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelected(r)}
                className="cursor-pointer hover:bg-[var(--muted)]"
              >
                <td className="whitespace-nowrap px-3 py-1.5 text-xs">{fmt(r.createdAt)}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.eventName}</td>
                <td className="px-3 py-1.5">
                  <Badge variant={STATUS[r.deliveryStatus].variant}>
                    {STATUS[r.deliveryStatus].label}
                  </Badge>
                </td>
                <td className="px-3 py-1.5">{r.attemptCount}</td>
                <td className="px-3 py-1.5">{r.responseStatus ?? "—"}</td>
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
                  {fmt(selected.createdAt)}
                  {selected.leadEmail ? ` · ${selected.leadEmail}` : ""}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm">
              <Badge variant={STATUS[selected.deliveryStatus].variant}>
                {STATUS[selected.deliveryStatus].label}
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
            ) : selected.deliveryStatus !== "delivered" ? (
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                Retry unavailable — no active webhook for this event.
              </p>
            ) : null}

            <Section title="Payload" body={selected.payload} />
            <Section
              title="Response"
              body={selected.responseBody ?? "(no delivery attempt)"}
            />
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
