"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventActivityRow } from "@/features/events/types";
import { retryEvent } from "@/features/events/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatIST } from "@/lib/date";

// IST across the whole app (matches Submissions/Contacts) — never the raw UTC ISO.
const fmt = (iso: string) => formatIST(iso);

const STATUS: Record<EventActivityRow["deliveryStatus"], { label: string; variant: "success" | "outline" | "muted" }> = {
  delivered: { label: "delivered", variant: "success" },
  failed: { label: "failed", variant: "outline" },
  none: { label: "no delivery", variant: "muted" },
};

export function WebhookLogsTable({ rows }: { rows: EventActivityRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function retry(id: string) {
    start(async () => {
      await retryEvent(id);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No events yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
          <tr>
            <th className="w-6 px-3 py-1.5" />
            <th className="px-3 py-1.5">Sent at (IST)</th>
            <th className="px-3 py-1.5">Event</th>
            <th className="px-3 py-1.5">Contact</th>
            <th className="px-3 py-1.5">Status</th>
            <th className="px-3 py-1.5">Code</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const open = openId === r.id;
            return (
              <RowGroup
                key={r.id}
                row={r}
                open={open}
                onToggle={() => setOpenId(open ? null : r.id)}
                onRetry={() => retry(r.id)}
                pending={pending}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowGroup({
  row,
  open,
  onToggle,
  onRetry,
  pending,
}: {
  row: EventActivityRow;
  open: boolean;
  onToggle: () => void;
  onRetry: () => void;
  pending: boolean;
}) {
  const status = STATUS[row.deliveryStatus];
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-[var(--muted)]">
        <td className="px-3 py-1.5 text-[var(--muted-foreground)]">{open ? "▾" : "▸"}</td>
        <td className="whitespace-nowrap px-3 py-1.5 text-xs">{fmt(row.createdAt)}</td>
        <td className="px-3 py-1.5 font-mono text-xs">{row.eventName}</td>
        <td className="px-3 py-1.5 text-xs">{row.leadEmail ?? "—"}</td>
        <td className="px-3 py-1.5">
          <Badge variant={status.variant}>{status.label}</Badge>
        </td>
        <td className="px-3 py-1.5">{row.responseStatus ?? "—"}</td>
      </tr>
      {open ? (
        <tr className="bg-[var(--muted)]/40">
          <td colSpan={6} className="px-3 py-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* REQUEST */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Request</p>
                <Field label="Method" value="POST" mono />
                <Field label="Sent at (IST)" value={fmt(row.createdAt)} />
                <Field label="Event" value={row.eventName} mono />
                <Field label="URL" value={row.endpoint ?? "—"} mono wrap />
                <p className="mt-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">Payload sent</p>
                <pre className="max-h-80 overflow-auto rounded-md border bg-[var(--background)] p-3 text-xs leading-relaxed">
                  {row.payload}
                </pre>
              </div>

              {/* RESPONSE */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Response</p>
                <Field label="Status">
                  <Badge variant={status.variant}>{status.label}</Badge>
                </Field>
                <Field label="HTTP status" value={row.responseStatus != null ? String(row.responseStatus) : "—"} />
                <Field label="Attempts" value={String(row.attemptCount)} />
                <p className="mt-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                  {row.error ? "Error" : "Body received"}
                </p>
                <pre className="max-h-80 overflow-auto rounded-md border bg-[var(--background)] p-3 text-xs leading-relaxed">
                  {row.error ?? row.responseBody ?? "(no delivery attempt)"}
                </pre>
                {row.canRetry ? (
                  <div>
                    <Button size="sm" onClick={onRetry} disabled={pending}>
                      {pending ? "Retrying…" : "Retry"}
                    </Button>
                  </div>
                ) : row.deliveryStatus !== "delivered" ? (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Retry unavailable — no active webhook for this event.
                  </p>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Field({
  label,
  value,
  children,
  mono,
  wrap,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-[var(--muted-foreground)]">{label}</span>
      {children ?? (
        <span className={`${mono ? "font-mono" : ""} ${wrap ? "break-all" : ""}`}>{value}</span>
      )}
    </div>
  );
}
