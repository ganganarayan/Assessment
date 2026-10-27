"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startSubscriptionCheckout, verifySubscriptionPayment } from "@/features/billing/actions/subscribe";
import { firePlatformBrowserEvent } from "@/lib/meta/platform-pixel-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Mirrors PLAN_IDS in lib/billing/plans. Duplicated rather than imported to keep this
// client component free of the server-side catalog module.
type PlanId = "GATE" | "SIGNAL" | "AGENCY" | "ENTERPRISE";
type BillingTerm = "MONTHLY" | "YEARLY";

interface PlanCard {
  id: PlanId;
  name: string;
  priceUsd: number;
  /** Annual price PER MONTH - the figure a buyer compares. Null where none is published. */
  annualPerMonthUsd: number | null;
  /** What the card is actually charged once a year. Null where none is published. */
  annualTotalUsd: number | null;
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
  currentTerm,
  prefill,
}: {
  plans: PlanCard[];
  currentPlan: PlanId;
  currentRank: number;
  /**
   * The term already held, or null when nothing is purchased (trial, parked).
   *
   * Null is deliberately not "MONTHLY": somebody on a trial has no monthly period to
   * forfeit, so they must not be shown the switch button or the pro-ration warning, and
   * their first purchase stays an ordinary upgrade.
   */
  currentTerm: BillingTerm | null;
  prefill: { name: string; email: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Somebody already paying yearly has nothing to choose, so the toggle opens on the
  // term they are on rather than resetting them to monthly.
  const [term, setTerm] = useState<BillingTerm>(currentTerm ?? "MONTHLY");
  const yearly = term === "YEARLY";

  async function subscribe(plan: PlanCard) {
    setMsg(null);
    setBusyPlan(plan.id);
    try {
      await loadRazorpay();
      const res = await startSubscriptionCheckout(plan.id, term);
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
        // The term the SERVER created the subscription on, not the toggle's state. If the
        // two ever disagreed, the modal would describe a charge different from the one
        // being authorised, and the modal is the last thing the customer reads.
        description: `${plan.name} plan - ${res.data.term === "YEARLY" ? "billed yearly" : "billed monthly"}, $${res.data.amountUsd}`,
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
                : { ok: true, text: "Payment received - activating your plan shortly." },
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

      {/* Monthly / yearly. Hidden from somebody already on the year: there is nothing
          for them to pick, and a live toggle would only lead to a refusal. */}
      {currentTerm !== "YEARLY" ? (
        <div className="flex items-center gap-2">
          {(["MONTHLY", "YEARLY"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTerm(t)}
              aria-pressed={term === t}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                term === t
                  ? "bg-green-600 text-white"
                  : "border text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              }`}
            >
              {t === "MONTHLY" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = p.id === currentPlan;
          const isUpgrade = p.rank > currentRank;
          // The one same-tier purchase that is allowed: the tier they hold, moving from
          // monthly onto the year. Mirrors the guard in startSubscriptionCheckout, so a
          // button is never shown for something the action will refuse.
          const isTermSwitch = p.rank === currentRank && yearly && currentTerm === "MONTHLY";
          // A first purchase on the yearly term is an ordinary upgrade, not a switch.
          const sellable = (isUpgrade || isTermSwitch) && (!yearly || p.annualTotalUsd !== null);
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
                  ${yearly && p.annualPerMonthUsd !== null ? p.annualPerMonthUsd : p.priceUsd}
                  <span className="text-sm font-normal text-[var(--muted-foreground)]">{p.id === "ENTERPRISE" ? "+ / mo" : " / mo"}</span>
                </p>
                {yearly ? (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {p.annualTotalUsd === null
                      ? "quoted, billed monthly"
                      : `$${p.annualTotalUsd} charged once a year`}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ul className="flex flex-col gap-1 text-sm text-[var(--muted-foreground)]">
                  {p.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
                {/* Enterprise is quoted, not bought: it has no fixed Razorpay plan, so
                    the card points at a conversation instead of a checkout. */}
                {p.id === "ENTERPRISE" ? (
                  <a
                    href="/contact"
                    className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors hover:bg-[var(--muted)]"
                  >
                    Talk to us
                  </a>
                ) : sellable ? (
                  <Button size="sm" disabled={pending || busyPlan !== null} onClick={() => subscribe(p)}>
                    {busyPlan === p.id
                      ? "Opening…"
                      : isTermSwitch
                        ? `Switch ${p.name} to yearly`
                        : `Upgrade to ${p.name}`}
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
        {yearly
          ? "Billed once a year in USD. Your response allowance is still monthly. Upgrades take effect immediately after payment; the plan renews automatically until cancelled."
          : "Billed monthly in USD. Upgrades take effect immediately after payment; your plan renews automatically until cancelled."}
      </p>
      {/* 🔴 SAID BEFORE THE SWITCH, NOT AFTER. Razorpay cannot move a subscription between
          plans, so going yearly creates a new subscription and cancels the monthly one the
          moment the year is paid. The days left on the month that was already paid for are
          not pro-rated, and a customer who finds that out from their statement is right to
          be annoyed. */}
      {yearly && currentTerm === "MONTHLY" ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Switching to yearly starts a new subscription and stops the monthly one as soon as
          the year is paid. Whatever is left of the month you have already paid for is not
          refunded or carried over.
        </p>
      ) : null}
    </div>
  );
}
