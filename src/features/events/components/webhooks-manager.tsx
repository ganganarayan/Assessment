"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WebhookRow } from "@/features/events/types";
import {
  createWebhook,
  editWebhook,
  activateWebhook,
  deactivateWebhook,
  purgeWebhook,
} from "@/features/events/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatIST } from "@/lib/date";

// IST everywhere (matches the rest of the app), never the raw UTC ISO.
const fmt = (iso: string | null) => (iso ? formatIST(iso) : "—");

export interface TriggerOption {
  value: string;
  label: string;
  defaultName: string;
}

export function WebhooksManager({
  active,
  inactive,
  triggers,
}: {
  active: WebhookRow[];
  inactive: WebhookRow[];
  triggers: TriggerOption[];
}) {
  const router = useRouter();
  const [trigger, setTrigger] = useState(triggers[0]?.value ?? "");
  const [name, setName] = useState(triggers[0]?.defaultName ?? "");
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Inline edit state (one row at a time).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");

  function onTriggerChange(v: string) {
    setTrigger(v);
    const t = triggers.find((x) => x.value === v);
    if (t) setName(t.defaultName); // suggest the canonical name; user can change it
  }

  function create() {
    setErr(null);
    start(async () => {
      const res = await createWebhook(trigger, name, url, enabled);
      if (!res.ok) return setErr(res.error);
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

  function beginEdit(r: WebhookRow) {
    if (
      !confirm(
        "Editing the event name or URL can BREAK delivery to your CRM until you re-map it there.\n\nThis is only allowed before the first successful delivery. Continue?",
      )
    )
      return;
    setErr(null);
    setEditingId(r.id);
    setEditName(r.name);
    setEditUrl(r.url);
  }

  function saveEdit(id: string) {
    setErr(null);
    start(async () => {
      const res = await editWebhook(id, editName, editUrl);
      if (!res.ok) return setErr(res.error ?? "Edit failed.");
      setEditingId(null);
      router.refresh();
    });
  }

  const rowProps = {
    editingId,
    editName,
    editUrl,
    setEditName,
    setEditUrl,
    beginEdit,
    saveEdit,
    cancelEdit: () => setEditingId(null),
    pending,
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Create: trigger + delivered name + URL */}
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm text-[var(--foreground)] sm:w-64"
            value={trigger}
            onChange={(e) => onTriggerChange(e.target.value)}
            aria-label="Trigger event"
          >
            {triggers.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Input
            className="sm:w-56"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="event name (e.g. completed_paid)"
            aria-label="Delivered event name"
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
          <Button onClick={create} disabled={pending || !trigger || !name.trim() || !url.trim()}>
            Create
          </Button>
        </div>
        <p className="px-1 text-xs text-[var(--muted-foreground)]">
          Pick the <strong>trigger</strong> (which app event fires it), then name the event however your
          CRM expects — dotted (<span className="font-mono">lead.created</span>) or underscore
          (<span className="font-mono">completed_paid</span>). Editable until the first successful
          delivery, then locked.
        </p>
      </div>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}

      <Table title="Active" rows={active} {...rowProps} secondary={(r) => (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => deactivateWebhook(r.id))}>
          Deactivate
        </Button>
      )} />

      <Table title="Inactive" rows={inactive} {...rowProps} secondary={(r) => (
        <>
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
        </>
      )} />
    </div>
  );
}

function Table({
  title,
  rows,
  secondary,
  editingId,
  editName,
  editUrl,
  setEditName,
  setEditUrl,
  beginEdit,
  saveEdit,
  cancelEdit,
  pending,
}: {
  title: string;
  rows: WebhookRow[];
  secondary: (r: WebhookRow) => React.ReactNode;
  editingId: string | null;
  editName: string;
  editUrl: string;
  setEditName: (v: string) => void;
  setEditUrl: (v: string) => void;
  beginEdit: (r: WebhookRow) => void;
  saveEdit: (id: string) => void;
  cancelEdit: () => void;
  pending: boolean;
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
                <th className="px-3 py-1.5">Trigger</th>
                <th className="px-3 py-1.5">Event Name</th>
                <th className="px-3 py-1.5">Endpoint URL</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5">Log Count</th>
                <th className="px-3 py-1.5">Last Fired</th>
                <th className="px-3 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) =>
                editingId === r.id ? (
                  <tr key={r.id} className="bg-[var(--muted)]/30">
                    <td className="px-3 py-1.5 text-xs">{r.eventLabel}</td>
                    <td className="px-3 py-1.5">
                      <Input className="h-8" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </td>
                    <td className="px-3 py-1.5" colSpan={3}>
                      <Input className="h-8" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                    </td>
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" disabled={pending} onClick={() => saveEdit(r.id)}>Save</Button>
                        <Button size="sm" variant="outline" disabled={pending} onClick={cancelEdit}>Cancel</Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5 text-xs">{r.eventLabel}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {r.name} {r.locked ? <span title="Locked after first delivery">🔒</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="max-w-xs truncate">{r.url}</span>
                        <CopyButton text={r.url} />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant={r.status === "ACTIVE" ? "success" : "muted"}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-1.5">{r.logCount}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs">{fmt(r.lastFired)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex justify-end gap-2">
                        {!r.locked ? (
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => beginEdit(r)}>
                            Edit
                          </Button>
                        ) : null}
                        {secondary(r)}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title="Copy endpoint URL"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          },
          () => {},
        );
      }}
      className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] hover:bg-[var(--muted)]"
    >
      {done ? "Copied ✓" : "Copy"}
    </button>
  );
}
