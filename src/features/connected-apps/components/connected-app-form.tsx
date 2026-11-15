"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveConnectedApp, testConnectedApp } from "@/features/connected-apps/actions";
import type { ConnectedAppRow } from "@/features/connected-apps/schema";

const EMPTY: ConnectedAppRow = {
  id: "",
  prefix: "",
  name: "",
  url: "",
  hasSecret: false,
  description: "",
  upgradeUrl: "",
  enabled: true,
  sortOrder: 10,
};

/** One app's settings card. With no row it is the "Add an app" form. */
export function ConnectedAppForm({ row }: { row?: ConnectedAppRow }) {
  const start = row ?? EMPTY;
  const [v, setV] = useState({ ...start, secret: "" });
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const field = "border border-[var(--border)] bg-[var(--background)]";

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-[var(--border)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const res = await saveConnectedApp({
            id: row?.id,
            prefix: v.prefix,
            name: v.name,
            url: v.url,
            secret: v.secret,
            description: v.description,
            upgradeUrl: v.upgradeUrl,
            enabled: v.enabled,
            sortOrder: v.sortOrder,
          });
          setMsg(res.ok ? "🟢 Saved." : `🟡 ${res.error}`);
          if (res.ok && !row) setV({ ...EMPTY, secret: "" });
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{row ? `${row.name} (${row.prefix}_)` : "Add an app"}</strong>
        {row ? <span className="text-sm">{!row.url ? "🟡 No URL: hidden" : !row.enabled ? "🟡 Switched off" : "🟢 Connected"}</span> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label>Name</Label>
          <Input className={field} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="VidaPulse" />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Tool prefix</Label>
          <Input className={field} value={v.prefix} onChange={(e) => set("prefix", e.target.value)} placeholder="vidapulse" />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label>Internal MCP URL</Label>
          <Input className={field} value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="https://app.example.com/api/mcp" />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label>Service secret {row?.hasSecret ? "(saved; leave blank to keep it)" : ""}</Label>
          <Input className={field} type="password" autoComplete="off" value={v.secret} onChange={(e) => set("secret", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label>One-line description</Label>
          <Input className={field} value={v.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Upgrade link</Label>
          <Input className={field} value={v.upgradeUrl} onChange={(e) => set("upgradeUrl", e.target.value)} placeholder="https://..." />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Order</Label>
          <Input className={field} type="number" value={v.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        Show this app&apos;s tools to users who have it
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : row ? "Save" : "Add app"}
        </Button>
        {row ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending || !row.url}
            onClick={() =>
              run(async () => {
                const t = await testConnectedApp(row.id);
                setMsg(
                  !t.ok
                    ? `🟡 Not reachable: ${t.error}`
                    : t.active
                      ? `🟢 Reachable. Your login is active there, ${t.tools.length} tools: ${t.tools.join(", ") || "none"}.`
                      : "🟢 Reachable. Your login is not active there, so its tools stay hidden for you.",
                );
              })
            }
          >
            Test connection
          </Button>
        ) : null}
      </div>
      {msg ? <p className="text-sm">{msg}</p> : null}
    </form>
  );
}
