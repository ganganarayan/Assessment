"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelTestSubscription,
  downgradeTestSubscription,
  startTestCheckout,
  verifyTestPayment,
} from "@/features/billing/actions/test-charge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PlanId = "GATE" | "SIGNAL" | "AGENCY" | "ENTERPRISE";
const RANK: Record<PlanId, number> = { GATE: 1, SIGNAL: 2, AGENCY: 3, ENTERPRISE: 4 };

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
}
interface RazorpayCtor {
  new (options: Record<string, unknown>): RazorpayInstance;
}
function getRazorpayCtor(): RazorpayCtor | undefined {
  return (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
}
function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getRazorpayCtor()) return resolve();
    const existing = document.getElementById("razorpay-checkout-js");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load the payment gateway.")));
      return;
    }
    const s = document.createElement("script");
    s.id = "razorpay-checkout-js";
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load the payment gateway."));
    document.body.appendChild(s);
  });
}

export interface TestPaymentsState {
  plan: string | null;
  status: string | null;
  parked: boolean;
  trialing: boolean;
  renewsAt: string | null;
  ownerEmail: string | null;
}

export function TestPaymentsTable({
  tenants,
  selectedId,
  state,
  plans,
  payments,
}: {
  tenants: { id: string; label: string }[];
  selectedId: string | null;
  state: TestPaymentsState | null;
  plans: { id: PlanId; label: string; amountText: string }[];
  payments: { id: string; when: string; plan: string; amount: string; ref: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const live = state && (state.status === "ACTIVE" || state.status === "PAST_DUE") ? (state.plan as PlanId | null) : null;
  const heldRank = live ? RANK[live] : 0;
  const disabled = pending || busy !== null || !selectedId;

  async function pay(planId: PlanId) {
    if (!selectedId) return;
    setMsg(null);
    setBusy(`pay-${planId}`);
    try {
      await loadRazorpay();
      const res = await startTestCheckout(selectedId, planId);
      if (!res.ok || !res.data) {
        setMsg({ ok: false, text: res.ok ? "Could not start checkout." : res.error });
        setBusy(null);
        return;
      }
      const d = res.data;
      const Ctor = getRazorpayCtor();
      if (!Ctor) {
        window.location.href = d.shortUrl;
        return;
      }
      const tenantId = selectedId;
      const rzp = new Ctor({
        key: d.keyId,
        subscription_id: d.subscriptionId,
        name: "Assess360",
        description: `Test: ${planId} at ${d.amountText} a month`,
        prefill: d.prefill,
        theme: { color: "#16a34a" },
        handler: (r: RazorpaySuccess) => {
          start(async () => {
            const v = await verifyTestPayment({ tenantId, ...r });
            setMsg(
              v.ok
                ? { ok: true, text: `Paid. The workspace is now on ${v.data?.plan ?? planId}. Receipt emailed to the owner.` }
                : { ok: false, text: v.error },
            );
            setBusy(null);
            router.refresh();
          });
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.on("payment.failed", (resp) => {
        setMsg({ ok: false, text: resp?.error?.description || "Payment failed." });
        setBusy(null);
      });
      rzp.open();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
      setBusy(null);
    }
  }

  function downgrade(planId: PlanId) {
    if (!selectedId) return;
    setMsg(null);
    setBusy(`down-${planId}`);
    start(async () => {
      const r = await downgradeTestSubscription(selectedId, planId);
      setMsg(r.ok ? { ok: true, text: r.data?.summary ?? "Downgraded." } : { ok: false, text: r.error });
      setBusy(null);
      router.refresh();
    });
  }

  function cancel() {
    if (!selectedId) return;
    if (!window.confirm("Cancel now? The plan ends immediately, features switch off and Razorpay stops charging. This cannot be undone.")) return;
    setMsg(null);
    setBusy("cancel");
    start(async () => {
      const r = await cancelTestSubscription(selectedId);
      setMsg(r.ok ? { ok: true, text: r.data?.summary ?? "Cancelled." } : { ok: false, text: r.error });
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Workspace</span>
        <select
          className="h-10 rounded-md border bg-[var(--background)] px-3"
          value={selectedId ?? ""}
          onChange={(e) => router.push(e.target.value ? `/admin/test-payments?t=${encodeURIComponent(e.target.value)}` : "/admin/test-payments")}
        >
          <option value="">Pick a workspace</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {state ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Now: <strong className="text-[var(--foreground)]">{state.plan ?? "no plan"}</strong>
          {state.status ? ` (${state.status})` : ""}
          {state.trialing ? ", on trial" : ""}
          {state.parked ? ", parked" : ""}
          {state.renewsAt ? `. Renews ${state.renewsAt}` : ""}
          {`. Emails go to ${state.ownerEmail ?? "nobody (no owner login)"}.`}
        </p>
      ) : null}

      {msg ? <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p> : null}

      <div className="flex flex-col gap-2">
        {plans.map((p) => {
          const rank = RANK[p.id];
          const isLive = live === p.id;
          return (
            <Card key={p.id} className={isLive ? "border-green-600" : undefined}>
              <CardContent className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-32">
                  <p className="font-semibold">
                    {p.label} {isLive ? <span className="text-xs text-green-600">current</span> : null}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">{p.amountText} a month</p>
                </div>
                <div className="grid grid-cols-2 gap-2 md:flex">
                  <Button size="sm" disabled={disabled || live !== null} onClick={() => pay(p.id)}>
                    {busy === `pay-${p.id}` && live === null ? "Opening..." : `Subscribe ${p.amountText}`}
                  </Button>
                  <Button size="sm" disabled={disabled || live === null || rank <= heldRank} onClick={() => pay(p.id)}>
                    {busy === `pay-${p.id}` && live !== null ? "Opening..." : `Upgrade ${p.amountText}`}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || live === null || rank >= heldRank}
                    onClick={() => downgrade(p.id)}
                  >
                    {busy === `down-${p.id}` ? "Switching..." : "Downgrade"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={disabled || !isLive} onClick={cancel}>
                    {busy === "cancel" && isLive ? "Cancelling..." : "Cancel"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {payments.length ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Last charges on this workspace</p>
          {payments.map((r) => (
            <p key={r.id} className="text-[var(--muted-foreground)]">
              {r.when} · {r.plan} · {r.amount} · {r.ref}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
