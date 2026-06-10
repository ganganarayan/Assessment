"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RegistryRow } from "@/features/events/types";
import {
  createEvent,
  activateEvent,
  deactivateEvent,
  purgeEvent,
} from "@/features/events/actions/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Variant = "success" | "muted" | "outline";
const STATUS_VARIANT: Record<RegistryRow["status"], Variant> = {
  ACTIVE: "success",
  DEACTIVATED: "muted",
  PURGED: "outline",
};

export function EventRegistryManager({
  active,
  deactivated,
  purged,
}: {
  active: RegistryRow[];
  deactivated: RegistryRow[];
  purged: RegistryRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    setErr(null);
    start(async () => {
      const res = await createEvent(name);
      if (!res.ok) return setErr(res.error);
      setName("");
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event Name (e.g. lead.created)"
          />
        </div>
        <Button onClick={create} disabled={pending || name.trim() === ""}>
          Create Event
        </Button>
      </div>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}

      <Section title="Active" rows={active}>
        {(r) => (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => deactivateEvent(r.id))}>
            Deactivate
          </Button>
        )}
      </Section>

      <Section title="Deactivated" rows={deactivated}>
        {(r) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => activateEvent(r.id))}>
              Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (confirm("Purge is permanent and NOT retrievable. Only the purged entry remains. Continue?")) {
                  run(() => purgeEvent(r.id));
                }
              }}
            >
              Purge
            </Button>
          </div>
        )}
      </Section>

      <Section title="Purged" rows={purged}>
        {() => <span className="text-xs text-[var(--muted-foreground)]">—</span>}
      </Section>
    </div>
  );
}

function fmt(iso: string | null) {
  return iso ? iso.slice(0, 16).replace("T", " ") : "—";
}

function Section({
  title,
  rows,
  children,
}: {
  title: string;
  rows: RegistryRow[];
  children: (r: RegistryRow) => React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">
        {title}{" "}
        <span className="text-sm font-normal text-[var(--muted-foreground)]">
          ({rows.length})
        </span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">None.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Event Name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Event Count</th>
                <th className="px-3 py-2">Last Fired</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.name}
                    {r.builtIn ? (
                      <Badge variant="outline" className="ml-2">built-in</Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-2">{r.count}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmt(r.lastFired)}</td>
                  <td className="px-3 py-2 text-right">{children(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
