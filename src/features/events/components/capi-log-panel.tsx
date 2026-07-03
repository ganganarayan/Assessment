"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIST } from "@/lib/date";
import {
  fireCapiLog,
  savePurchaseSettings,
  type PurchaseSettingsForm,
} from "@/features/events/actions/capi-test";
import { type CapiLogRow } from "@/features/events/data";

/**
 * CAPI log: every captured payment's Purchase event + Meta's response. Standard
 * amounts auto-fire; everything else is `pending` — fire it manually here (event
 * name editable per row for high-ticket sales). Plus the auto-fire settings.
 */
export function CapiLogPanel({
  initialLogs,
  initialSettings,
}: {
  initialLogs: CapiLogRow[];
  initialSettings: PurchaseSettingsForm;
}) {
  const [rows, setRows] = useState<CapiLogRow[]>(initialLogs);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [form, setForm] = useState<PurchaseSettingsForm>(initialSettings);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setSavedMsg(null);
      const r = await savePurchaseSettings(form);
      setSavedMsg(r.ok ? "Saved ✓" : r.error ?? "Save failed");
    });

  const fire = (row: CapiLogRow) =>
    start(async () => {
      const r = await fireCapiLog(row.id, overrides[row.id]);
      setRows((rs) =>
        rs.map((x) =>
          x.id === row.id
            ? {
                ...x,
                eventName: overrides[row.id]?.trim() || x.eventName,
                status: r.ok ? "sent" : "failed",
                httpStatus: r.status ?? null,
                response: (r.response ?? r.error ?? "") || null,
                firedAt: new Date().toISOString(),
              }
            : x,
        ),
      );
    });

  const badge = (s: string) =>
    s === "sent" ? "text-green-600" : s === "failed" ? "text-red-500" : "text-amber-500";

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="text-lg font-semibold">Purchase CAPI log</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Every captured payment is logged. Amounts in the auto-fire list send{" "}
          <span className="font-mono">Purchase</span> automatically; others stay{" "}
          <span className="font-mono">pending</span> — fire them below. Amounts above the
          high-ticket threshold use your custom event name.
        </p>
      </div>

      {/* Settings */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-[var(--muted)]/30 p-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Auto-fire amounts (₹, comma-separated)</Label>
          <Input
            className="w-56"
            value={form.autoFireAmounts}
            onChange={(e) => setForm((f) => ({ ...f, autoFireAmounts: e.target.value }))}
            placeholder="199,499,999,1000"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">High-ticket threshold (₹)</Label>
          <Input
            type="number"
            className="w-32"
            value={form.highTicketThreshold}
            onChange={(e) => setForm((f) => ({ ...f, highTicketThreshold: Number(e.target.value) }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Event name for amounts &gt; threshold</Label>
          <Input
            className="w-48"
            value={form.highTicketEventName}
            onChange={(e) => setForm((f) => ({ ...f, highTicketEventName: e.target.value }))}
            placeholder="Purchase"
          />
        </div>
        <Button disabled={pending} onClick={save}>Save</Button>
        {savedMsg ? <span className="text-xs text-[var(--muted-foreground)]">{savedMsg}</span> : null}
      </div>

      {/* Log */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-1.5">Captured (IST)</th>
              <th className="px-3 py-1.5">Contact</th>
              <th className="px-3 py-1.5 text-right">Amount</th>
              <th className="px-3 py-1.5">Event name</th>
              <th className="px-3 py-1.5 text-center">Match</th>
              <th className="px-3 py-1.5 text-center">Status</th>
              <th className="px-3 py-1.5">Meta response</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[var(--muted-foreground)]">No captures logged yet.</td></tr>
            ) : null}
            {rows.map((r) => {
              const done = r.status === "sent";
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">{formatIST(r.createdAt)}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col">
                      <span>{r.name ?? "—"}</span>
                      <span className="text-[var(--muted-foreground)]">{r.email ?? "—"}</span>
                      <span className="text-[var(--muted-foreground)]">{r.phone ?? "—"}</span>
                      <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{r.providerPaymentId ?? "—"}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.amountRupees != null ? `₹${r.amountRupees}` : "—"}</td>
                  <td className="px-3 py-2">
                    <Input
                      className="h-8 w-36 text-xs"
                      value={overrides[r.id] ?? r.eventName}
                      onChange={(e) => setOverrides((o) => ({ ...o, [r.id]: e.target.value }))}
                      disabled={done}
                    />
                  </td>
                  <td className="px-3 py-2 text-center text-xs">{r.matched ? "full" : "email"}</td>
                  <td className={`px-3 py-2 text-center text-xs ${badge(r.status)}`}>
                    {r.status}
                    {r.autoFired ? <span className="block text-[10px] text-[var(--muted-foreground)]">auto</span> : null}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-xs text-[var(--muted-foreground)]" title={r.response ?? ""}>
                    {r.httpStatus ? `HTTP ${r.httpStatus} · ` : ""}{r.response ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" disabled={pending || done} onClick={() => fire(r)}>
                      {done ? "Sent ✓" : "Fire to Meta"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
