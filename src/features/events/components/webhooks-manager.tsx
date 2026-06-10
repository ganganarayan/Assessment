"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WebhookRow } from "@/features/events/types";
import {
  createWebhook,
  activateWebhook,
  deactivateWebhook,
  purgeWebhook,
} from "@/features/events/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

function fmt(iso: string | null) {
  return iso ? iso.slice(0, 16).replace("T", " ") : "—";
}

export function WebhooksManager({
  active,
  inactive,
}: {
  active: WebhookRow[];
  inactive: WebhookRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    setErr(null);
    start(async () => {
      const res = await createWebhook(name, url, enabled);
      if (!res.ok) return setErr(res.error);
      setName("");
      setUrl("");
      setEnabled(true);
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setErr(res.error ?? "Action failed.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Create form: one row */}
      <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
        <Input
          className="sm:w-56"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Event Name (e.g. lead.created)"
        />
        <Input
          className="sm:flex-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
        />
        <label className="flex items-center gap-2 px-1 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Active
        </label>
        <Button onClick={create} disabled={pending || !name.trim() || !url.trim()}>
          Create
        </Button>
      </div>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}

      <Table
        title="Active"
        rows={active}
        actions={(r) => (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => deactivateWebhook(r.id))}>
            Deactivate
          </Button>
        )}
      />

      <Table
        title="Inactive"
        rows={inactive}
        actions={(r) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => activateWebhook(r.id))}>
              Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (confirm("Purge permanently removes this webhook configuration. It cannot be restored. (Logs are kept.) Continue?")) {
                  run(() => purgeWebhook(r.id));
                }
              }}
            >
              Purge
            </Button>
          </div>
        )}
      />
    </div>
  );
}

function Table({
  title,
  rows,
  actions,
}: {
  title: string;
  rows: WebhookRow[];
  actions: (r: WebhookRow) => React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-sm font-normal text-[var(--muted-foreground)]">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">None.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-1.5">Event Name</th>
                <th className="px-3 py-1.5">Endpoint URL</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5">Log Count</th>
                <th className="px-3 py-1.5">Last Fired</th>
                <th className="px-3 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.name}</td>
                  <td className="max-w-xs truncate px-3 py-1.5 text-xs">{r.url}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant={r.status === "ACTIVE" ? "success" : "muted"}>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-1.5">{r.logCount}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs">{fmt(r.lastFired)}</td>
                  <td className="px-3 py-1.5 text-right">{actions(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
