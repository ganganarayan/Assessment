/**
 * What one AI call costs us, per model.
 *
 * 🔴 TOKENS ARE MEASURED, COST IS CALCULATED. The token counts on every AiUsage row
 * come from the provider's own response and are exact. The money is this table times
 * those tokens, and this table is a copy of a price list that changes without telling
 * us. So a model that is NOT listed here records its tokens with a cost of ZERO rather
 * than a guessed rate: an Accounts page that says "4.2M tokens, rate not set" is
 * useful, and one that says "$31.40" from an invented rate is worse than useless,
 * because it will be believed and it will be wrong.
 *
 * 🟡 CHECK THESE AGAINST THE PROVIDER'S PRICING PAGE BEFORE TRUSTING A PROFIT FIGURE.
 * They were entered on 20-10-2026 and nothing in the app revalidates them.
 *
 * Rates are USD per MILLION tokens, which is how all three providers publish them.
 */
export interface ModelRate {
  /** USD per million input tokens. */
  inPerM: number;
  /** USD per million output tokens. */
  outPerM: number;
}

/**
 * Keyed by the exact model string the app sends. Prefix matching handles the dated
 * snapshots providers append (gpt-4o-2024-11-20 bills as gpt-4o).
 */
export const MODEL_RATES: Readonly<Record<string, ModelRate>> = {
  "gpt-4o": { inPerM: 2.5, outPerM: 10 },
  "gpt-4o-mini": { inPerM: 0.15, outPerM: 0.6 },
  "gemini-1.5-pro": { inPerM: 1.25, outPerM: 5 },
  "gemini-1.5-flash": { inPerM: 0.075, outPerM: 0.3 },
};

/**
 * The rate for a model, or null when we do not have one.
 *
 * Longest prefix wins, so "gpt-4o-mini" is not served by the "gpt-4o" entry. Without
 * that ordering a cheap model silently bills at the expensive model's rate, which is
 * the one mistake in here that would overstate costs instead of understating them.
 */
export function rateFor(model: string): ModelRate | null {
  const key = model.trim().toLowerCase();
  if (!key) return null;
  let best: { len: number; rate: ModelRate } | null = null;
  for (const [prefix, rate] of Object.entries(MODEL_RATES)) {
    if (key.startsWith(prefix) && (!best || prefix.length > best.len)) {
      best = { len: prefix.length, rate };
    }
  }
  return best?.rate ?? null;
}

/**
 * Cost of one call in MICRO-dollars (USD x 1,000,000), rounded to a whole micro-dollar.
 *
 * Integer money on purpose: a single statement can cost a few thousandths of a cent,
 * and floats summed over tens of thousands of rows drift away from the real invoice.
 * Returns 0 for an unpriced model, which the caller records as-is - see the note at the
 * top about why that is better than a guess.
 */
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = rateFor(model);
  if (!rate) return 0;
  const usd = (inputTokens / 1_000_000) * rate.inPerM + (outputTokens / 1_000_000) * rate.outPerM;
  return Math.round(usd * 1_000_000);
}

/** True when we can price this model at all. Lets a report say "rate not set". */
export function isPriced(model: string): boolean {
  return rateFor(model) !== null;
}
