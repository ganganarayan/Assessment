/**
 * Indian-numbering money + count formatting. Pure, client-safe (used by the clinic
 * audit result page AND the AI context builder, so both quote identical figures).
 */

/** ₹17,25,000 — Indian digit grouping (last 3, then pairs). Rounds to whole rupees. */
export function formatINR(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString();
  let last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  if (rest) {
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    last3 = "," + last3;
  }
  return `${neg ? "-" : ""}₹${rest}${last3}`;
}

function trim(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** "17.25 lakh" / "1.2 crore" / "45,000" — human sub-label for a rupee amount. */
export function lakhLabel(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `${trim(n / 1e7)} crore`;
  if (a >= 1e5) return `${trim(n / 1e5)} lakh`;
  return formatINR(n).replace("₹", "");
}

/** "≈ ₹17.25 lakh a month" style sub-label. */
export function monthlyLabel(n: number): string {
  return `≈ ₹${lakhLabel(n)} a month`;
}

/** Whole-number percent from a 0..1 rate: 0.32 → "32%". */
export function pctLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
