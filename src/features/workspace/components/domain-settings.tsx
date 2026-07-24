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
  type DomainView,
} from "@/features/workspace/actions/domains";

export function DomainSettings({ initial }: { initial: DomainSettingsView }) {
  const router = useRouter();
  const [hostname, setHostname] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const managed = initial.railwayManaged;

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
    }, managed ? "Domain added — point its CNAME at the target shown, then Check status." : "Domain added — point its DNS, then Check status.");

  const targetFor = (d: DomainView) => d.dnsTarget ?? initial.cnameTarget;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border-l-2 border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Bring your own domain (e.g. <span className="font-mono">assess.yourbrand.com</span>). Add it
        below, then at your DNS provider add a <span className="font-semibold">CNAME</span> record
        pointing the host at the <span className="font-semibold">target shown for that domain</span>.
        {managed
          ? " We register it with our platform automatically and provision an HTTPS certificate — it goes live once the certificate is issued (usually a few minutes after DNS propagates)."
          : ` Point the CNAME at ${initial.cnameTarget}. Once DNS resolves here the domain serves your assessments.`}
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
                    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-600">Live · HTTPS</span>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                      {managed ? `Provisioning${d.certStatus ? ` · ${d.certStatus}` : ""}` : "Pending DNS"}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!(d.certLive || d.verified) ? (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => verifyDomain(d.id), "Live — your domain now serves over HTTPS.")}>Check status</Button>
                  ) : !d.isPrimary ? (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setPrimaryDomain(d.id), "Primary domain updated.")}>Make primary</Button>
                  ) : null}
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeDomain(d.id), "Domain removed.")}>Remove</Button>
                </div>
              </div>
              {/* DNS instruction row */}
              {!(d.certLive || d.verified) ? (
                <div className="rounded-md bg-[var(--muted)]/40 px-2.5 py-1.5 text-xs text-[var(--muted-foreground)]">
                  Add a <span className="font-semibold">CNAME</span> record: <span className="font-mono">{d.hostname}</span> →{" "}
                  <span className="font-mono text-[var(--foreground)] select-all">{targetFor(d)}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}
