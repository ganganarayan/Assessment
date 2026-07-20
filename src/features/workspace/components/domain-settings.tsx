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
    }, "Domain added — point its DNS, then Verify.");

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border-l-2 border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Bring your own domain (e.g. <span className="font-mono">assess.yourbrand.com</span>). At your
        DNS provider, add a <span className="font-semibold">CNAME</span> record pointing the host to{" "}
        <span className="font-mono text-[var(--foreground)]">{initial.cnameTarget}</span>, then click
        Verify. Once verified, this domain maps to your workspace and serves your assessments. TLS is
        provisioned by us after verification.
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
            <li key={d.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{d.hostname}</span>
                {d.isPrimary ? (
                  <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-600">Primary</span>
                ) : null}
                {d.verified ? (
                  <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-600">Verified</span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">Pending DNS</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!d.verified ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => verifyDomain(d.id), "Verified — your domain is live.")}>Verify</Button>
                ) : !d.isPrimary ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setPrimaryDomain(d.id), "Primary domain updated.")}>Make primary</Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeDomain(d.id), "Domain removed.")}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}
