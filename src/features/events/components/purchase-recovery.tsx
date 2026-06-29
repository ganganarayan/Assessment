"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resendPurchaseToMeta } from "@/features/events/actions/capi-test";
import type { RecentPurchase } from "@/features/events/data";
import { Button } from "@/components/ui/button";

type Result = Awaited<ReturnType<typeof resendPurchaseToMeta>>;

/** Re-send the real Purchase conversion to Meta for paid submissions whose buyer
 *  never returned (so CAPI never fired). Deduped by the Razorpay payment id. */
export function PurchaseRecovery({ purchases }: { purchases: RecentPurchase[] }) {
  const router = useRouter();
  const [results, setResults] = useState<Record<string, Result>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  function send(submissionId: string, force = false) {
    setPendingId(submissionId);
    start(async () => {
      const r = await resendPurchaseToMeta(submissionId, force);
      setResults((m) => ({ ...m, [submissionId]: r }));
      setPendingId(null);
      if (r.ok) router.refresh(); // reflect the new "Meta conversion" stamp
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Re-send a purchase conversion to Meta</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          For sales whose buyer never returned to the browser, so the conversion never fired. Sends the
          REAL Purchase event — deduped by the Razorpay payment id, so it won&apos;t double-count an
          already-tracked sale. Must be within Meta&apos;s ~7-day window. Needs{" "}
          <span className="font-mono">META_CAPI_ACCESS_TOKEN</span> on this environment (prod).
        </p>
      </div>
      {purchases.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No captured payments found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-1.5">When</th>
                <th className="px-3 py-1.5">Email</th>
                <th className="px-3 py-1.5">Amount</th>
                <th className="px-3 py-1.5">Recorded via</th>
                <th className="px-3 py-1.5">Meta conversion</th>
                <th className="px-3 py-1.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {purchases.map((p) => {
                const r = results[p.submissionId];
                return (
                  <tr key={p.submissionId}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs">{p.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-3 py-1.5 text-xs">{p.email ?? "—"}</td>
                    <td className="px-3 py-1.5 text-xs">{p.amountRupees != null ? `₹${p.amountRupees}` : "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{p.recordedVia ?? "—"}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {p.metaConversionAt ? (
                        <span className="text-green-600">✓ sent {p.metaConversionAt.slice(0, 16).replace("T", " ")}</span>
                      ) : (
                        <span className="text-amber-600">not sent</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {p.metaConversionAt || r?.ok ? (
                          <>
                            <Button size="sm" variant="outline" disabled title="Already sent — no action needed">
                              Sent ✓
                            </Button>
                            <button
                              type="button"
                              disabled={pendingId === p.submissionId}
                              onClick={() => send(p.submissionId, true)}
                              className="text-xs text-[var(--muted-foreground)] underline disabled:opacity-50"
                              title="Re-send with the ad-click id attached (for attribution)"
                            >
                              {pendingId === p.submissionId ? "…" : "Re-send (with click id)"}
                            </button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" disabled={pendingId === p.submissionId} onClick={() => send(p.submissionId, false)}>
                            {pendingId === p.submissionId ? "Sending…" : "Send to Meta"}
                          </Button>
                        )}
                        {r ? (
                          <span className={r.ok ? "text-xs text-green-600" : "text-xs text-red-500"}>
                            {r.ok ? `✓ accepted (HTTP ${r.status})` : `✗ ${r.error ?? `HTTP ${r.status}`}`}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {Object.entries(results).map(([sid, r]) =>
        r.response ? (
          <details key={sid} className="text-xs">
            <summary className="cursor-pointer text-[var(--muted-foreground)]">Meta response · {sid.slice(0, 8)}</summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-[var(--muted)] p-2">{r.response}</pre>
          </details>
        ) : null,
      )}
    </div>
  );
}
