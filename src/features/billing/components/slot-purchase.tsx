"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  addAgencyTenantSlot,
  removeAgencyTenantSlot,
  verifySlotPayment,
} from "@/features/billing/actions/slots";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

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

/** Same loader the plan cards use: one script, reused if another component added it. */
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

/**
 * Buying and giving back client-workspace slots, $29 a month each.
 *
 * Two different interactions behind one button, because the first slot is a new
 * subscription (Checkout opens) and every later one is a quantity change on it (no
 * payment screen, billed on the next invoice). The copy says which just happened, since
 * "added, nothing charged today" and "paid now" are different facts and an agency
 * reconciling a card statement needs the right one.
 */
export function SlotPurchase({
  included,
  extra,
  used,
  priceUsd,
  prefill,
}: {
  included: number;
  extra: number;
  used: number;
  priceUsd: number;
  prefill: { name: string; email: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Giving one back is only offered when it would not leave them short of what they run.
  const canRemove = extra > 0 && used <= included + extra - 1;

  async function add() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await addAgencyTenantSlot();
      if (!res.ok || !res.data) {
        setMsg({ ok: false, text: res.ok ? "Could not add a workspace." : res.error });
        setBusy(false);
        return;
      }
      if (res.data.kind === "added") {
        setMsg({
          ok: true,
          text: `Added. You now have ${included + res.data.quantity} client workspaces, and the extra $${priceUsd} a month starts on your next invoice.`,
        });
        setBusy(false);
        router.refresh();
        return;
      }

      await loadRazorpay();
      const { subscriptionId, keyId, shortUrl } = res.data;
      const Ctor = getRazorpayCtor();
      if (!Ctor || !keyId || !subscriptionId) {
        window.location.href = shortUrl;
        return;
      }
      const rzp = new Ctor({
        key: keyId,
        subscription_id: subscriptionId,
        name: "Assess360",
        description: `Client workspace - $${priceUsd} / month`,
        prefill: { name: prefill.name, email: prefill.email },
        theme: { color: "#16a34a" },
        handler: (response: RazorpaySuccess) => {
          start(async () => {
            const v = await verifySlotPayment({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
            });
            setMsg(
              v.ok
                ? { ok: true, text: "Paid. Your extra client workspace is ready to create." }
                : { ok: true, text: "Payment received - your extra workspace will appear shortly." },
            );
            setBusy(false);
            router.refresh();
          });
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (resp) => {
        setMsg({ ok: false, text: resp?.error?.description || "Payment failed. Please try again." });
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong. Please try again." });
      setBusy(false);
    }
  }

  function give() {
    setMsg(null);
    start(async () => {
      const res = await removeAgencyTenantSlot();
      setMsg(
        res.ok
          ? {
              ok: true,
              text: "Scheduled. You keep it until the end of this billing period, then it stops being charged.",
            }
          : { ok: false, text: res.error },
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          <strong>Need another client workspace?</strong>{" "}
          <span className="text-[var(--muted-foreground)]">
            ${priceUsd} a month each, on top of the {included} your plan includes.
            {extra > 0 ? ` You have added ${extra}.` : ""}
          </span>
        </span>
        <div className="flex items-center gap-2">
          {canRemove ? (
            <Button size="sm" variant="ghost" disabled={busy || pending} onClick={give}>
              Give one back
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={busy || pending} onClick={add}>
            {busy || pending ? "Working..." : `Add one for $${priceUsd}/mo`}
          </Button>
        </div>
      </div>
      {msg ? (
        <p className={`text-xs ${msg.ok ? "text-[var(--muted-foreground)]" : "text-[var(--destructive)]"}`}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
