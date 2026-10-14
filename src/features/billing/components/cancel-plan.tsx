"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelSubscription } from "@/features/billing/actions/subscribe";

/**
 * The cancel control, and the reason it exists: /refund tells every customer "you can
 * cancel at any time from your account" and "cancel before the renewal date and you are
 * not charged again". Neither was true - there was no cancel anywhere in the product,
 * so the only way out was an email somebody had to answer.
 *
 * 🔴 THE CONFIRM SAYS IT CANNOT BE UNDONE, BECAUSE IT CANNOT. Razorpay has no resume for
 * a cycle-end cancellation. Discovering that afterwards, from support, is how a customer
 * who meant to pause leaves angry.
 *
 * The exit assessment comes AFTER the cancellation is booked, never before it. Asking
 * why first would mean somebody who closes the survey is not cancelled, which puts the
 * published promise right back where it started.
 */
export function CancelPlan({
  periodEnd,
  alreadyCancelling,
}: {
  /** ISO instant the paid period ends, or null when it was never recorded. */
  periodEnd: string | null;
  /** True when a cancellation is already booked - the control becomes a statement. */
  alreadyCancelling: boolean;
}) {
  const [done, setDone] = useState<{ summary: string; exitUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const endLabel = periodEnd
    ? new Date(periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  if (alreadyCancelling && !done) {
    return (
      <p className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-500">
        This plan is set to stop{endLabel ? ` on ${endLabel}` : " at the end of this period"}. You keep everything
        until then, and you will not be charged again. Contact support if you want to stay.
      </p>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border px-3 py-3">
        <p className="text-sm font-medium text-green-600">{done.summary}</p>
        {done.exitUrl ? (
          <>
            <p className="text-xs text-[var(--muted-foreground)]">
              One last thing, if you have two minutes. Knowing why you left is the only way this gets better.
            </p>
            <div>
              <Button size="sm" onClick={() => window.location.assign(done.exitUrl as string)}>
                Tell us why →
              </Button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const run = () =>
    start(async () => {
      setError(null);
      const confirmed = window.confirm(
        `Cancel your plan?\n\n` +
          `• You keep everything until ${endLabel ?? "the end of this period"}.\n` +
          `• You will not be charged again.\n` +
          `• After that the funnel pauses and your data is kept, not deleted.\n\n` +
          `THIS CANNOT BE UNDONE - restarting means subscribing again.`,
      );
      if (!confirmed) return;
      const r = await cancelSubscription();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone({ summary: r.data?.summary ?? "Cancelled.", exitUrl: r.data?.exitAssessmentUrl ?? null });
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={run}
        className="border-red-500/60 text-red-600 hover:bg-red-500/10"
      >
        Cancel plan
      </Button>
      <span className="text-xs text-[var(--muted-foreground)]">
        Stops at the end of the period you have paid for{endLabel ? `, ${endLabel}` : ""}. Nothing is deleted.
      </span>
      {error ? <span className="text-xs font-medium text-red-500">{error}</span> : null}
    </div>
  );
}
