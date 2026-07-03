"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendPurchaseByEmail } from "@/features/events/actions/capi-test";

/**
 * Manual Purchase re-send for the specific external ₹199 sales that need to reach
 * Meta with full attribution. Pre-loaded rows; fire each ONCE (event_id = the
 * Razorpay payment id, so Meta dedups against the thank-you-page browser Purchase).
 * The already-sent ones live in the recovery table below as the log.
 */
const SEED: { paymentId: string; email: string; phone: string; amount: number }[] = [
  { paymentId: "pay_T8S23ic7FRahNy", email: "amit@frommonday.in", phone: "+919870841111", amount: 199 },
  { paymentId: "pay_T8F1Wcj1959LVi", email: "sksaddam218@gmail.com", phone: "+918341461688", amount: 199 },
  { paymentId: "pay_T84kfxyYwzGmkd", email: "mrudu286@gmail.com", phone: "+916380241561", amount: 199 },
  { paymentId: "pay_T73srb3Hz9Vca3", email: "jitinmj@gmail.com", phone: "+919446774175", amount: 199 },
];

type RowState = { pending: boolean; result: string | null; ok: boolean | null };

export function ManualPurchaseResend() {
  const [, start] = useTransition();
  const [state, setState] = useState<Record<string, RowState>>({});

  const send = (row: (typeof SEED)[number]) =>
    start(async () => {
      setState((s) => ({ ...s, [row.paymentId]: { pending: true, result: null, ok: null } }));
      const r = await resendPurchaseByEmail({
        paymentId: row.paymentId,
        email: row.email,
        phone: row.phone,
        amountRupees: row.amount,
      });
      const msg = r.ok
        ? `Sent ✓ (${r.matched ? "full attribution" : "email+phone only"})${r.status ? ` · HTTP ${r.status}` : ""}`
        : `Failed: ${r.error ?? r.response ?? "unknown"}`;
      setState((s) => ({ ...s, [row.paymentId]: { pending: false, result: msg, ok: r.ok } }));
    });

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="text-lg font-semibold">Re-send these ₹199 purchases to Meta</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Fires the standard <span className="font-mono">Purchase</span> with full attribution
          (email, phone, fbc/fbp/ip/UA pulled by email). <strong>event_id = the payment id</strong>, so
          it dedups against the thank-you-page browser Purchase. Fire each <strong>once</strong>.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-1.5">Payment ID</th>
              <th className="px-3 py-1.5">Email</th>
              <th className="px-3 py-1.5">Phone</th>
              <th className="px-3 py-1.5 text-right">Amount</th>
              <th className="px-3 py-1.5" />
              <th className="px-3 py-1.5">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {SEED.map((row) => {
              const st = state[row.paymentId];
              return (
                <tr key={row.paymentId}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row.paymentId}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{row.email}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{row.phone}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">₹{row.amount}</td>
                  <td className="px-3 py-2">
                    <Button size="sm" disabled={st?.pending || st?.ok === true} onClick={() => send(row)}>
                      {st?.pending ? "Sending…" : st?.ok ? "Sent ✓" : "Send to Meta"}
                    </Button>
                  </td>
                  <td className={`px-3 py-2 text-xs ${st?.ok === false ? "text-red-500" : "text-[var(--muted-foreground)]"}`}>
                    {st?.result ?? "—"}
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
