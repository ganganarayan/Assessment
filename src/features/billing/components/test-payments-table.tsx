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
  /** The plan held now (ACTIVE or PAST_DUE), or null. */
  plan: string | null;
  status: string | null;
  renewsAt: string | null;
  emailTo: string | null;
}

type Currency = "INR" | "USD";

export function TestPaymentsTable({
  state,
  plans,
  bounds,
  payments,
}: {
  state: TestPaymentsState;
  plans: { id: PlanId; label: string; defaults: Record<Currency, string> }[];
  bounds: Record<Currency, { min: number; max: number }>;
  payments: { id: string; when: string; plan: string; amount: string; ref: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [currency, setCurrency] = useState<Record<string, Currency>>(() =>
    Object.fromEntries(plans.map((p) => [p.id, "INR" as Currency])),
  );
  const [amount, setAmount] = useState<Record<string, string>>(() =>
    Object.fromEntries(plans.map((p) => [p.id, p.defaults.INR])),
  );

  const live = (state.plan as PlanId | null) ?? null;
  const heldRank = live ? RANK[live] : 0;
  const disabled = pending || busy !== null;

  function pickCurrency(planId: PlanId, next: Currency) {
    const p = plans.find((x) => x.id === planId);
    setCurrency((c) => ({ ...c, [planId]: next }));
    if (p) setAmount((a) => ({ ...a, [planId]: p.defaults[next] }));
  }

  async function pay(planId: PlanId) {
    setMsg(null);
    setBusy(`pay-${planId}`);
    try {
      await loadRazorpay();
      const res = await startTestCheckout(planId, currency[planId] ?? "INR", amount[planId] ?? "");
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
      const rzp = new Ctor({
        key: d.keyId,
        subscription_id: d.subscriptionId,
        name: "Assess360",
        description: `Test: ${planId} at ${d.amountText} a month`,
        prefill: d.prefill,
        theme: { color: "#16a34a" },
        handler: (r: RazorpaySuccess) => {
          start(async () => {
            const v = await verifyTestPayment(r);
            setMsg(
              v.ok
                ? { ok: true, text: `Paid ${d.amountText}. The test plan is now ${v.data?.plan ?? planId}. Receipt emailed to you.` }
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
    setMsg(null);
    setBusy(`down-${planId}`);
    start(async () => {
      const r = await downgradeTestSubscription(planId, currency[planId] ?? "INR", amount[planId] ?? "");
      setMsg(r.ok ? { ok: true, text: r.data?.summary ?? "Downgraded." } : { ok: false, text: r.error });
      setBusy(null);
      router.refresh();
    });
  }

  function cancel() {
    if (!window.confirm("Cancel now? The test plan ends immediately and Razorpay stops charging. This cannot be undone.")) return;
    setMsg(null);
    setBusy("cancel");
    start(async () => {
      const r = await cancelTestSubscription();
      setMsg(r.ok ? { ok: true, text: r.data?.summary ?? "Cancelled." } : { ok: false, text: r.error });
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--muted-foreground)]">
        Now: <strong className="text-[var(--foreground)]">{live ? live : "no plan"}</strong>
        {state.status ? ` (${state.status})` : ""}
        {state.renewsAt && live ? `. Renews ${state.renewsAt}` : ""}
        {`. Emails go to ${state.emailTo ?? "you"}.`}
      </p>

      {msg ? <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p> : null}

      <div className="flex flex-col gap-2">
        {plans.map((p) => {
          const rank = RANK[p.id];
          const isLive = live === p.id;
          const cur = currency[p.id] ?? "INR";
          const amt = amount[p.id] ?? "";
          const priceText = `${cur} ${amt || "0"}`;
          return (
            <Card key={p.id} className={isLive ? "border-green-600" : undefined}>
              <CardContent className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <p className="min-w-28 font-semibold">
                    {p.label} {isLive ? <span className="text-xs text-green-600">current</span> : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`${p.label} currency`}
                      className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm"
                      value={cur}
                      disabled={disabled}
                      onChange={(e) => pickCurrency(p.id, e.target.value === "USD" ? "USD" : "INR")}
                    >
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                    </select>
                    <input
                      aria-label={`${p.label} amount`}
                      className="h-9 w-24 rounded-md border bg-[var(--background)] px-2 text-sm"
                      inputMode="decimal"
                      value={amt}
                      disabled={disabled}
                      onChange={(e) => setAmount((a) => ({ ...a, [p.id]: e.target.value }))}
                    />
                    <span className="text-xs text-[var(--muted-foreground)]">
                      a month ({bounds[cur].min.toFixed(2)} to {bounds[cur].max.toFixed(2)})
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:flex">
                  <Button size="sm" disabled={disabled || live !== null} onClick={() => pay(p.id)}>
                    {busy === `pay-${p.id}` && live === null ? "Opening..." : `Subscribe ${priceText}`}
                  </Button>
                  <Button size="sm" disabled={disabled || live === null || rank <= heldRank} onClick={() => pay(p.id)}>
                    {busy === `pay-${p.id}` && live !== null ? "Opening..." : `Upgrade ${priceText}`}
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
          <p className="font-medium">Last test charges</p>
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
