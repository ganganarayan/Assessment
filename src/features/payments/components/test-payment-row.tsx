"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openRazorpayCheckout } from "@/lib/payments/checkout-client";
import { startTestPayment } from "@/features/payments/actions/test-payment";
import {
  TEST_PAYMENT_CURRENCIES,
  TEST_PAYMENT_MAX,
  TEST_PAYMENT_MIN,
  type TestPaymentAccount,
  type TestPaymentCurrency,
} from "@/features/payments/test-payment-shared";

/**
 * One Test payment row inside a Razorpay card: amount (default 1), INR or USD, Pay test.
 * A real charge on this account, recorded in Billing's paid log and nowhere else.
 */
export function TestPaymentRow({
  account,
  back,
}: {
  account: TestPaymentAccount;
  /** Which settings screen Razorpay returns to. */
  back: "w" | "admin";
}) {
  const [amount, setAmount] = useState("1");
  const [currency, setCurrency] = useState<TestPaymentCurrency>("INR");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  // The verify route sends us back with ?testPayment=ok|failed&account=...&pid=...
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("account") !== account) return;
    const result = sp.get("testPayment");
    if (result === "ok") {
      setMsg({ ok: true, text: `Paid. Razorpay payment id ${sp.get("pid") ?? ""}. Logged in Billing.` });
    } else if (result === "failed") {
      setMsg({ ok: false, text: "The payment could not be confirmed. Nothing was logged." });
    }
  }, [account]);

  const pay = () => {
    setMsg(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n < TEST_PAYMENT_MIN || n > TEST_PAYMENT_MAX) {
      setMsg({ ok: false, text: `Enter an amount from ${TEST_PAYMENT_MIN} to ${TEST_PAYMENT_MAX}.` });
      return;
    }
    start(async () => {
      const res = await startTestPayment({ account, amount: n, currency, back });
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setBusy(true);
      try {
        await openRazorpayCheckout(res.checkout, () => setBusy(false));
      } catch {
        setBusy(false);
        setMsg({ ok: false, text: "Could not open Razorpay Checkout. Try again." });
      }
    });
  };

  return (
    <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] p-3">
      <Label className="text-xs">Test payment</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="number"
          inputMode="decimal"
          min={TEST_PAYMENT_MIN}
          max={TEST_PAYMENT_MAX}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="sm:w-32"
          aria-label="Test amount"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as TestPaymentCurrency)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
          aria-label="Currency"
        >
          {TEST_PAYMENT_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={pay} disabled={pending || busy}>
          {pending || busy ? "Opening..." : "Pay test"}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        A real charge on this account, refunded only if you refund it in Razorpay. Never sent to Meta
        and never counted as revenue. USD needs International Payments on in this Razorpay account.
      </p>
      {msg ? (
        <p className={`text-xs ${msg.ok ? "text-green-600" : "text-yellow-600"}`}>{msg.text}</p>
      ) : null}
    </div>
  );
}
