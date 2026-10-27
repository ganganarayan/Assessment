// ============================================================================
//  Money on the by-industry pages. Rupees by default, dollars outside India.
// ============================================================================
//
//  A leaf module on purpose: no imports, nothing server-only, no spec data. The
//  leak calculator is a client component and imports its constants from here and
//  from industries/types, which is what keeps twenty-one industries' worth of
//  page copy out of the browser bundle.
//
//  🔴 This is for the INDUSTRY PAGES only. Plan pricing is a different problem
//  with a different answer: a plan has one real price that a payment gateway
//  will charge, so showing it in a converted currency would be quoting a figure
//  nobody can pay. The figures here are the VISITOR'S OWN numbers, typed in by
//  them, which is exactly why they can be denominated in whatever currency the
//  visitor thinks in.

export type Currency = "INR" | "USD";

/**
 * The conversion used for the PREFILLED defaults, and nothing else.
 *
 * Named and exported rather than inlined, and printed in the footnote under the
 * result, for the same reason RECLAIM_SHARE is: it is a modelled number, it will
 * be out of date, and a reader who can see it can disagree with it. Every figure
 * the visitor actually reasons about is derived from what they typed over the top
 * of these defaults, so the rate moves the starting point and never the answer.
 *
 * Deliberately a round number. A rate quoted to two decimals would imply a
 * precision this has no business claiming about next quarter.
 */
export const INR_PER_USD = 88;

/**
 * Round to two significant figures, so a converted default reads like a number a
 * human would have typed.
 *
 * A straight division gives $1,363.63 for a 120,000-rupee enrolment, and a
 * prefilled input holding $1,363.63 tells the visitor the page is guessing with
 * false precision. $1,400 says the same thing honestly.
 */
export function roundNice(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.round(v / mag) * mag;
}

/** An INR default, expressed in the currency on screen. */
export function convertDefault(inr: number, currency: Currency): number {
  return currency === "INR" ? inr : roundNice(inr / INR_PER_USD);
}

const SYMBOL: Record<Currency, string> = { INR: "\u20B9", USD: "$" };
const LOCALE: Record<Currency, string> = { INR: "en-IN", USD: "en-US" };
const WORD: Record<Currency, string> = { INR: "rupees", USD: "dollars" };

export function symbol(currency: Currency): string {
  return SYMBOL[currency];
}

/** "in rupees" / "in dollars", for the input labels that need to say which. */
export function currencyWord(currency: Currency): string {
  return WORD[currency];
}

/** An amount, grouped the way the currency's own readers group digits. */
export function money(v: number, currency: Currency): string {
  return `${SYMBOL[currency]}${Math.round(v).toLocaleString(LOCALE[currency])}`;
}

/**
 * A plain count, grouped by the same locale as the money beside it.
 *
 * Indian grouping on a dollar page would be the tell that the figures were
 * translated rather than written, and the working puts counts and amounts on
 * adjacent lines.
 */
export function count(v: number, currency: Currency): string {
  return Math.round(v).toLocaleString(LOCALE[currency]);
}

/**
 * The annual figure in the unit the reader actually holds it in: lakh and crore
 * for rupees, million for dollars.
 *
 * Returns an empty string when the digits are already the clearest form, which
 * is below a lakh in rupees and below a million in dollars. "About $40 thousand"
 * is worse than $40,000, and the thresholds differ because the words do.
 */
export function inWords(v: number, currency: Currency): string {
  if (currency === "USD") {
    if (v >= 1000000) {
      const m = v / 1000000;
      return `About $${m.toFixed(m < 10 ? 2 : 1)} million`;
    }
    return "";
  }
  if (v >= 10000000) {
    const cr = v / 10000000;
    return `About \u20B9${cr.toFixed(cr < 10 ? 2 : 1)} crore`;
  }
  if (v >= 100000) {
    const lakh = v / 100000;
    return `About \u20B9${lakh.toFixed(lakh < 10 ? 2 : 1)} lakh`;
  }
  return "";
}
