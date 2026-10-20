/**
 * When does a paid subscription renew?
 *
 * 🔴 THE APP ANSWERS THIS, NOT RAZORPAY. `Subscription.currentPeriodEnd` is only ever
 * written by the webhook, so a subscription activated by the browser returning from
 * Checkout has none at all - which is exactly the state the first real subscription on
 * this install ended up in. A renewal date that exists only when a webhook arrives is
 * not a billing record, it is a hope. This computes it from the payment the app itself
 * confirmed, so there is always an answer and it is always the same answer.
 *
 * THE SAME DAY EACH MONTH, not "plus 30 days". Thirty days drifts: paid on the 1st of
 * January, a +30 rule renews on the 31st, then the 2nd of March, and within a year the
 * date we show the customer and the date Razorpay actually charges are a week apart.
 * Razorpay's monthly cycle bills on the same date each month, so this matches it.
 *
 * Pure and dependency-free, so it is unit-testable and safe on either side of render.
 */

/**
 * The next renewal after `paidAt`: the same day of the month, one month on.
 *
 * SHORT MONTHS CLAMP TO THE LAST DAY. Paid on the 31st of January renews on the 28th
 * of February (29th in a leap year), not the 2nd or 3rd of March. Letting the date
 * roll forward is the classic version of this bug: it silently walks a 31st-of-the-month
 * customer to the 3rd over a year, and every month they are billed before the date we
 * printed for them.
 *
 * The clamp does NOT stick. The anchor stays `paidAt`, so the next payment on the 28th
 * of February produces the 28th of March, and the customer's real anchor day is
 * restored by the following payment rather than being lost to one short month.
 */
export function nextRenewal(paidAt: Date, months = 1): Date {
  const y = paidAt.getUTCFullYear();
  const m = paidAt.getUTCMonth();
  const day = paidAt.getUTCDate();

  // Day 0 of the month AFTER the target is the target month's last day, which is how
  // "how many days does this month have" is asked without a table of month lengths.
  const lastDayOfTarget = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      y,
      m + months,
      Math.min(day, lastDayOfTarget),
      paidAt.getUTCHours(),
      paidAt.getUTCMinutes(),
      paidAt.getUTCSeconds(),
      paidAt.getUTCMilliseconds(),
    ),
  );
}

/**
 * Has the renewal date passed?
 *
 * Deliberately NOT used to withhold anything. Access is decided by the subscription's
 * STATUS, which Razorpay owns through the webhook, and a renewal date that has slipped
 * past is a reporting fact rather than grounds for locking a customer out: the charge
 * may simply be in flight. This exists so a stale date can be shown as stale.
 */
export function renewalOverdue(renewsAt: Date | null, now: Date = new Date()): boolean {
  return renewsAt !== null && renewsAt.getTime() < now.getTime();
}
