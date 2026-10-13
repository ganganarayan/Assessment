"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPaymentLink, cancelPaymentLink } from "@/features/payments/actions/payment-links";
import { ACCOUNT_LABEL, type PaymentLinkAccount, type PaymentLinkView } from "@/features/payments/links-shared";

/**
 * One lead's payment links, inside the Submissions table.
 *
 * Collapsed it is a button and a one-line history. Open it asks for the two things a
 * link needs - how much, and which account - and hands back a URL already on the
 * clipboard, because the next thing the operator does is paste it into WhatsApp.
 *
 * The amount is NOT prefilled from the assessment's price. That price is the
 * consultation fee the funnel sells; this link is for the product that is sold
 * afterwards, and a wrong default on a money field is worse than an empty one. What it
 * does prefill is the last amount sent to THIS person, which is right every time a
 * second instalment is being asked for.
 */
export function PaymentLinkCell({
  submissionId,
  accounts,
  links,
}: {
  submissionId: string;
  /** Accounts with keys saved. Empty = this workspace cannot collect yet. */
  accounts: PaymentLinkAccount[];
  links: PaymentLinkView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(links[0]?.amount ? String(links[0].amount) : "");
  const [account, setAccount] = useState<PaymentLinkAccount>(accounts[0] ?? "GST");
  // Optional floor. Blank means the system minimum (₹1) - the client is the one typing
  // the amount, so this is the only lever against a ₹1 "payment" of a ₹50,000 invoice.
  const [minAmount, setMinAmount] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const copy = (url: string) => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(url);
        setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
      })
      .catch(() => {});
  };

  const create = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount.");
      return;
    }
    setError(null);
    start(async () => {
      const min = Number(minAmount);
      const res = await createPaymentLink({
        submissionId,
        amount: value,
        account,
        ...(Number.isFinite(min) && min > 0 ? { minAmount: min } : {}),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFresh(res.url);
      copy(res.url);
      setOpen(false);
      router.refresh();
    });
  };

  const cancel = (id: string) => {
    if (!confirm("Withdraw this payment link? Anyone holding it will no longer be able to pay.")) return;
    setError(null);
    start(async () => {
      const res = await cancelPaymentLink(id);
      if (!res.ok) {
        setError(res.error ?? "Could not withdraw it.");
        return;
      }
      router.refresh();
    });
  };

  if (accounts.length === 0) {
    return (
      <span
        className="text-[11px] text-[var(--muted-foreground)]"
        title="Save Razorpay keys in Settings to send payment links."
      >
        No keys
      </span>
    );
  }

  return (
    <div className="flex min-w-[150px] flex-col gap-1">
      {/* The link just made, so it can be copied again without hunting for it. */}
      {fresh ? (
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold text-green-600">{copied === fresh ? "Copied" : "Ready"}</span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => copy(fresh)}>
            Copy
          </Button>
        </div>
      ) : null}

      {open ? (
        <div className="flex flex-col gap-1 rounded-md border p-2">
          <Input
            type="number"
            inputMode="decimal"
            min={1}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount ₹"
            className="h-7 text-xs"
            aria-label="Amount in rupees"
          />
          <Input
            type="number"
            inputMode="decimal"
            min={1}
            step="1"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            placeholder="Minimum ₹ (optional)"
            className="h-7 text-xs"
            aria-label="Minimum amount in rupees"
          />
          {accounts.length > 1 ? (
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value === "NON_GST" ? "NON_GST" : "GST")}
              className="h-7 rounded-md border bg-[var(--background)] px-1 text-xs"
              aria-label="Razorpay account"
            >
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {ACCOUNT_LABEL[a]}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[10px] text-[var(--muted-foreground)]">{ACCOUNT_LABEL[account]} account</span>
          )}
          <div className="flex gap-1">
            <Button size="sm" className="h-6 px-2 text-[11px]" disabled={pending} onClick={create}>
              {pending ? "…" : "Create"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-[10px] leading-snug text-[var(--muted-foreground)]">
            They can change the amount before paying, down to the minimum.
          </p>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="h-6 w-full px-2 text-[11px]" onClick={() => setOpen(true)}>
          Payment link
        </Button>
      )}

      {/* History, newest first. Paid rows are the record of a sale and keep no
          controls; an unpaid one can be copied again or withdrawn. */}
      {links.map((l) => (
        <div key={l.id} className="flex items-center gap-1 text-[11px]">
          {l.status === "PAID" ? (
            <span className="font-medium text-green-600 tabular-nums" title={l.paidAt ?? undefined}>
              ✓ ₹{(l.paidAmount ?? l.amount).toLocaleString("en-IN")}
            </span>
          ) : l.status === "CANCELLED" ? (
            <span className="text-[var(--muted-foreground)] line-through tabular-nums">
              ₹{l.amount.toLocaleString("en-IN")}
            </span>
          ) : (
            <>
              <span className="tabular-nums">₹{l.amount.toLocaleString("en-IN")}</span>
              <Button size="sm" variant="outline" className="h-5 px-1 text-[10px]" onClick={() => copy(l.url)}>
                {copied === l.url ? "Copied" : "Copy"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1 text-[10px]"
                disabled={pending}
                onClick={() => cancel(l.id)}
              >
                ✕
              </Button>
            </>
          )}
          <span className="text-[10px] text-[var(--muted-foreground)]">{ACCOUNT_LABEL[l.account]}</span>
        </div>
      ))}

      {error ? <span className="text-[10px] text-red-500">{error}</span> : null}
    </div>
  );
}
