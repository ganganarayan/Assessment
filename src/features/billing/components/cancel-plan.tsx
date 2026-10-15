"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelSubscription } from "@/features/billing/actions/subscribe";
import { formatISTDate } from "@/lib/date";

/**
 * The cancel control, and the reason it exists: /refund tells every customer "you can
 * cancel at any time from your account" and "cancel before the renewal date and you are
 * not charged again". Neither was true - there was no cancel anywhere in the product,
 * so the only way out was an email somebody had to answer.
 *
 * 🔴 THE CONSENT STEP IS THE CONFIRMATION, AND IT CANNOT BE UNDONE. Razorpay has no
 * resume for a cycle-end cancellation. Discovering that afterwards, from support, is how
 * a customer who meant to pause leaves angry. So what happens is spelled out on screen,
 * a tick acknowledges the irreversible part, and only then does the button work. It is
 * an inline panel rather than a browser confirm() because a native dialog cannot say
 * three things, cannot be read before deciding, and on mobile is a shrug.
 *
 * 🔴 THE SURVEY COMES AFTER THE CANCELLATION IS BOOKED, NEVER BEFORE IT. Asking why
 * first would mean somebody who closes the survey is not cancelled, which is the
 * "subscription trap" pattern the CCPA's dark-pattern guidelines name outright and the
 * FTC's negative-option rule prohibits. It is also the only version anybody answers
 * honestly: before the cancellation it reads as a save attempt.
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
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [done, setDone] = useState<{ summary: string; exitUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Seconds until the survey opens by itself. Null = not counting (no survey
  // configured, or they chose to stay on this screen).
  const [countdown, setCountdown] = useState<number | null>(null);

  /**
   * The survey opens on its own, after a pause long enough to read the confirmation.
   *
   * Both halves matter. Making them click a second button loses most of the answers to
   * a decision nobody owes us; redirecting instantly hides the one screen that says
   * when the plan stops and that nothing was deleted. So: the confirmation is shown,
   * the countdown says what is about to happen, and "Stay here" stops it - the
   * cancellation is already booked either way.
   */
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const url = done?.exitUrl;
      if (url) window.location.assign(url);
      return;
    }
    const t = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, done]);

  const endLabel = periodEnd
    ? formatISTDate(periodEnd)
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
      <div className="flex flex-col gap-3 rounded-lg border px-3 py-3">
        <p className="text-sm font-medium text-green-600">{done.summary}</p>
        {done.exitUrl ? (
          <>
            <p className="text-sm text-[var(--muted-foreground)]">
              One question, then a few taps you can skip. It changes nothing about the cancellation,
              and nobody will call you to talk you out of it.
              {countdown !== null ? (
                <> Opening in {countdown}…</>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => window.location.assign(done.exitUrl as string)}>
                Tell us why you left
              </Button>
              {countdown !== null ? (
                <Button size="sm" variant="ghost" onClick={() => setCountdown(null)}>
                  Stay here
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const run = () =>
    start(async () => {
      setError(null);
      const r = await cancelSubscription();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const exitUrl = r.data?.exitAssessmentUrl ?? null;
      setDone({ summary: r.data?.summary ?? "Cancelled.", exitUrl });
      if (exitUrl) setCountdown(5);
    });

  if (confirming) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-3">
        <p className="text-sm font-medium">Cancel your plan?</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-[var(--muted-foreground)]">
          <li>You keep everything until {endLabel ?? "the end of this period"}.</li>
          <li>You will not be charged again.</li>
          <li>After that your funnel pauses and your data is kept, not deleted.</li>
        </ul>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
          />
          <span>
            I understand this cannot be undone. Restarting means subscribing again.
          </span>
        </label>
        {error ? <p className="text-sm font-medium text-red-500">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !understood}
            onClick={run}
            className="border-red-500/60 text-red-600 hover:bg-red-500/10"
          >
            {pending ? "Cancelling…" : "Cancel my plan"}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              setConfirming(false);
              setUnderstood(false);
              setError(null);
            }}
          >
            Keep my plan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setConfirming(true)}
        className="border-red-500/60 text-red-600 hover:bg-red-500/10"
      >
        Cancel plan
      </Button>
      <span className="text-xs text-[var(--muted-foreground)]">
        Stops at the end of the period you have paid for{endLabel ? `, ${endLabel}` : ""}. Nothing is deleted.
      </span>
    </div>
  );
}
