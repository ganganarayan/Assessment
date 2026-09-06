"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addDomain,
  verifyDomain,
  setPrimaryDomain,
  removeDomain,
  type DomainSettingsView,
} from "@/features/workspace/actions/domains";

export function DomainSettings({ initial }: { initial: DomainSettingsView }) {
  const router = useRouter();
  const [hostname, setHostname] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const managed = initial.railwayManaged;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* noop */
      }
      ta.remove();
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? okMsg : r.error ?? "Something went wrong.");
      if (r.ok) router.refresh();
    });

  const onAdd = () =>
    run(async () => {
      const r = await addDomain(hostname);
      if (r.ok) setHostname("");
      return r;
    }, "Domain added — add the DNS records shown below at your provider, then Check status.");

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border-l-2 border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Bring your own domain (e.g. <span className="font-mono">assess.yourbrand.com</span>). Add it
        below, then copy the <span className="font-semibold">DNS records shown for it</span> into your
        domain provider (GoDaddy, Namecheap, Cloudflare, etc.). HTTPS is issued
        <span className="font-semibold"> automatically</span> once those records resolve — click{" "}
        <span className="font-semibold">Check status</span> and it goes live.
      </div>

      {/* Add */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <Label className="text-xs">Add a domain</Label>
          <Input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="assess.yourbrand.com"
            onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
          />
        </div>
        <Button size="sm" onClick={onAdd} disabled={pending || !hostname.trim()}>Add domain</Button>
      </div>

      {/* List */}
      {initial.domains.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No custom domains yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border">
          {initial.domains.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 px-3 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{d.hostname}</span>
                  {d.isPrimary ? (
                    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-600">Primary</span>
                  ) : null}
                  {d.certLive || d.verified ? (
                    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-600">✓ Live · HTTPS</span>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                      {managed ? `Provisioning${d.certStatus ? ` · ${d.certStatus}` : ""}` : "Pending DNS"}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => verifyDomain(d.id), "✓ Custom domain live — now serving over HTTPS.")}>Check status</Button>
                  {(d.certLive || d.verified) && !d.isPrimary ? (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setPrimaryDomain(d.id), "Primary domain updated.")}>Make primary</Button>
                  ) : null}
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeDomain(d.id), "Domain removed.")}>Remove</Button>
                </div>
              </div>
              {d.certLive || d.verified ? (
                // Confirmation once the certificate is live.
                <div className="rounded-md bg-green-500/10 px-2.5 py-1.5 text-xs font-medium text-green-600">
                  ✓ Custom domain live — serving your funnel over HTTPS at{" "}
                  <span className="font-mono">{d.hostname}</span>.
                </div>
              ) : (
                // Records the owner must add at their DNS provider. Copy each value.
                <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2.5">
                  <p className="text-xs font-semibold">Add these DNS records at your domain provider</p>
                  <div className="flex flex-col divide-y divide-[var(--border)]">
                    {(d.dnsRecords.length > 0
                      ? d.dnsRecords
                      : [{ type: "CNAME", name: d.hostname, value: d.dnsTarget ?? initial.cnameTarget, purpose: null, status: null }]
                    ).map((rec, i) => (
                      <div key={i} className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1 py-2 sm:grid-cols-[70px_minmax(0,1fr)_minmax(0,1.4fr)]">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Type</span>
                        <span className="font-mono text-xs sm:col-span-2">{rec.type}</span>

                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Name</span>
                        <span className="col-span-1 flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-mono text-xs text-[var(--foreground)] select-all" title={rec.name}>{rec.name}</span>
                          <button type="button" onClick={() => copy(`${d.id}-n-${i}`, rec.name)} className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--muted)]">
                            {copiedKey === `${d.id}-n-${i}` ? "✓" : "Copy"}
                          </button>
                        </span>

                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Value</span>
                        <span className="col-span-1 flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-mono text-xs text-[var(--foreground)] select-all" title={rec.value}>{rec.value}</span>
                          <button type="button" onClick={() => copy(`${d.id}-v-${i}`, rec.value)} className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--muted)]">
                            {copiedKey === `${d.id}-v-${i}` ? "✓" : "Copy"}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    DNS can take a few minutes (sometimes up to an hour) to propagate. Once added, click{" "}
                    <span className="font-semibold">Check status</span> — HTTPS is issued automatically and the
                    domain goes live.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}
