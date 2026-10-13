"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPayOrder } from "@/features/payments/actions/pay-order";
import { openRazorpayCheckout } from "@/lib/payments/checkout-client";

/**
 * The amount box on a payment link, and the only interactive part of the page.
 *
 * The figure is PREFILLED with what the sender asked for and the client may change
 * it - that is the whole reason this page exists instead of a Razorpay payment link,
 * whose amount is fixed at creation and cannot be edited by the payer. Whatever they
 * type is re-checked on the server against this link's floor before an order exists,
 * so editing the box in the browser buys nothing.
 */
export function PayForm({
  token,
  suggested,
  minAmount,
}: {
  token: string;
  /** Prefilled rupee amount, as the sender typed it. */
  suggested: number;
  /** Floor in rupees, enforced again on the server. */
  minAmount: number;
}) {
  const [amount, setAmount] = useState(String(suggested));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the amount you are paying.");
      return;
    }
    if (value < minAmount) {
      setError(`The minimum for this link is ₹${minAmount.toLocaleString("en-IN")}.`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createPayOrder({ token, amount: value });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    try {
      // redirect: true - Razorpay navigates to our verify route on success, which
      // records the sale and brings them back to this page in its paid state.
      await openRazorpayCheckout(res.checkout, () => setBusy(false));
    } catch {
      setError("Could not open the payment window. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs" htmlFor="pay-amount">
          Amount (₹)
        </Label>
        <Input
          id="pay-amount"
          // Numeric keypad on a phone, which is where most of these links are opened.
          type="number"
          inputMode="decimal"
          min={minAmount}
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="text-lg font-semibold tabular-nums"
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Change this if you are paying a different amount.
          {minAmount > 1 ? ` Minimum ₹${minAmount.toLocaleString("en-IN")}.` : ""}
        </p>
      </div>
      <Button onClick={pay} disabled={busy} className="h-11 w-full text-base">
        {busy ? "Opening payment…" : "Pay now"}
      </Button>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <p className="text-center text-[11px] text-[var(--muted-foreground)]">
        Payments are processed by Razorpay. Cards, UPI, net banking and wallets.
      </p>
    </div>
  );
}
