"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventType } from "@prisma/client";
import {
  saveWebhookEndpoint,
  testWebhook,
  regenerateWebhookSecret,
} from "@/features/events/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface WebhookRow {
  event: EventType;
  name: string;
  url: string;
  enabled: boolean;
  secret: string | null;
}

export function WebhooksManager({ rows }: { rows: WebhookRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <WebhookCard key={row.event} row={row} />
      ))}
    </div>
  );
}

function WebhookCard({ row }: { row: WebhookRow }) {
  const router = useRouter();
  const [url, setUrl] = useState(row.url);
  const [enabled, setEnabled] = useState(row.enabled);
  const [showSecret, setShowSecret] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await saveWebhookEndpoint(row.event, url, enabled);
      if (!res.ok) return setErr(res.error);
      setMsg("Saved.");
      router.refresh();
    });
  }

  function test() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await testWebhook(row.event);
      if (!res.ok) return setErr(res.error);
      setMsg(`Test delivered (status ${res.data?.status ?? "ok"}).`);
      router.refresh();
    });
  }

  function regen() {
    if (!confirm("Regenerate the signing secret? Receivers must be updated.")) return;
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await regenerateWebhookSecret(row.event);
      if (!res.ok) return setErr(res.error);
      setMsg("Secret regenerated.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-base">{row.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label>Endpoint URL</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/webhook"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled
        </label>

        <div className="flex flex-col gap-1">
          <Label>Secret</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border bg-[var(--muted)] px-2 py-1 text-xs">
              {row.secret
                ? showSecret
                  ? row.secret
                  : "•".repeat(24)
                : "(generated on save)"}
            </code>
            {row.secret ? (
              <Button size="sm" variant="ghost" onClick={() => setShowSecret((s) => !s)}>
                {showSecret ? "Hide" : "Reveal"}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={regen} disabled={pending}>
              Regenerate
            </Button>
          </div>
        </div>

        {err ? <p className="text-sm text-red-500">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-600">{msg}</p> : null}

        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Working…" : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={test} disabled={pending}>
            Test Webhook
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
