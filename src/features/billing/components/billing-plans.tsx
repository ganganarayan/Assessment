"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startSubscriptionCheckout, verifySubscriptionPayment } from "@/features/billing/actions/subscribe";
import { firePlatformBrowserEvent } from "@/lib/meta/platform-pixel-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type PlanId = "FREE" | "STARTER" | "GROWTH" | "SCALE";

interface PlanCard {
  id: PlanId;
  name: string;
  priceUsd: number;
  rank: number;
  features: string[];
}

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

// Accessed via a local cast so we don't collide with the order-checkout global
// declaration in checkout-client.ts (subscriptions use subscription_id, not order_id).
function getRazorpayCtor(): RazorpayCtor | undefined {
  return (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && getRazorpayCtor()) return resolve();
    const existing = document.getElementById("razorpay-checkout-js");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load the payment gateway.")));
      return;
    }
    const s = document.createElement("script");
    s.id = "razorpay-checkout-js";
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load the payment gateway. Check your connection."));
    document.body.appendChild(s);
  });
}

export function BillingPlans({
  plans,
  currentPlan,
  currentRank,
  prefill,
}: {
  plans: PlanCard[];
  currentPlan: PlanId;
  currentRank: number;
  prefill: { name: string; email: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function subscribe(plan: PlanCard) {
    setMsg(null);
    setBusyPlan(plan.id);
    try {
      await loadRazorpay();
      const res = await startSubscriptionCheckout(plan.id);
      if (!res.ok || !res.data) {
        setMsg({ ok: false, text: res.ok ? "Could not start checkout." : res.error });
        setBusyPlan(null);
        return;
      }
      const { subscriptionId, keyId, shortUrl } = res.data;
      const Ctor = getRazorpayCtor();
      if (!Ctor || !keyId || !subscriptionId) {
        // Fallback to the hosted payment page.
        window.location.href = shortUrl;
        return;
      }
      const rzp = new Ctor({
        key: keyId,
        subscription_id: subscriptionId,
        name: "Assess360",
        description: `${plan.name} plan — monthly subscription`,
        prefill: { name: prefill.name, email: prefill.email },
        theme: { color: "#16a34a" },
        handler: (response: RazorpaySuccess) => {
          start(async () => {
            const v = await verifySubscriptionPayment({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
              plan: plan.id,
            });
            // Fire the matching browser Purchase on the platform pixel (deduped with
            // the server CAPI by the returned eventId).
            if (v.ok && v.data?.purchase) {
              const p = v.data.purchase;
              firePlatformBrowserEvent(p.pixelId, "Purchase", { value: p.value, currency: "USD" }, p.eventId);
            }
            setMsg(
              v.ok
                ? { ok: true, text: `You're on ${plan.name}. It may take a moment to reflect everywhere.` }
                : { ok: true, text: "Payment received — activating your plan shortly." },
            );
            setBusyPlan(null);
            router.refresh();
          });
        },
        modal: { ondismiss: () => setBusyPlan(null) },
      });
      rzp.on("payment.failed", (resp) => {
        setMsg({ ok: false, text: resp?.error?.description || "Payment failed. Please try again." });
        setBusyPlan(null);
      });
      rzp.open();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong. Please try again." });
      setBusyPlan(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = p.id === currentPlan;
          const isUpgrade = p.rank > currentRank;
          return (
            <Card key={p.id} className={isCurrent ? "border-[var(--primary)]" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{p.name}</span>
                  {isCurrent ? (
                    <span className="rounded bg-[var(--muted)] px-2 py-0.5 text-xs font-medium">Current</span>
                  ) : null}
                </CardTitle>
                <p className="text-2xl font-bold">
                  ${p.priceUsd}
                  <span className="text-sm font-normal text-[var(--muted-foreground)]">{p.id === "FREE" ? "" : " / mo"}</span>
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ul className="flex flex-col gap-1 text-sm text-[var(--muted-foreground)]">
                  {p.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
                {p.id === "FREE" ? null : isUpgrade ? (
                  <Button size="sm" disabled={pending || busyPlan !== null} onClick={() => subscribe(p)}>
                    {busyPlan === p.id ? "Opening…" : `Upgrade to ${p.name}`}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    {isCurrent ? "Current plan" : "Included"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Billed monthly in USD. Upgrades take effect immediately after payment; your plan renews automatically until cancelled.
      </p>
    </div>
  );
}
