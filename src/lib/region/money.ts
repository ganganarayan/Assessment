/**
 * Money for RESPONDENT payments in the tenant's own currency (Phase 4). Pure.
 *
 * Amounts are kept in MINOR units (paise, cents) everywhere, as Razorpay wants them.
 * Not every currency has two decimals, so the exponent is per currency, never "/100".
 * The platform's own USD plans do not use this.
 */
export const DEFAULT_CURRENCY = "INR";

export interface PaymentCurrency {
  code: string;
  label: string;
  symbol: string;
  exponent: number;
  /** The smallest charge Razorpay takes, in minor units. */
  minMinor: number;
}

/** Currencies a tenant can choose. Razorpay must have international payments on for non-INR. */
export const PAYMENT_CURRENCIES: readonly PaymentCurrency[] = [
  { code: "INR", label: "Indian rupee", symbol: "₹", exponent: 2, minMinor: 100 },
  { code: "USD", label: "US dollar", symbol: "$", exponent: 2, minMinor: 50 },
  { code: "EUR", label: "Euro", symbol: "€", exponent: 2, minMinor: 50 },
  { code: "GBP", label: "British pound", symbol: "£", exponent: 2, minMinor: 30 },
  { code: "AED", label: "UAE dirham", symbol: "AED ", exponent: 2, minMinor: 200 },
  { code: "SGD", label: "Singapore dollar", symbol: "S$", exponent: 2, minMinor: 50 },
  { code: "AUD", label: "Australian dollar", symbol: "A$", exponent: 2, minMinor: 50 },
  { code: "CAD", label: "Canadian dollar", symbol: "C$", exponent: 2, minMinor: 50 },
];

const BY_CODE = new Map(PAYMENT_CURRENCIES.map((c) => [c.code, c]));

export function isPaymentCurrency(code: string | null | undefined): code is string {
  return !!code && BY_CODE.has(code);
}

export function currencyOr(code: string | null | undefined): string {
  return isPaymentCurrency(code) ? code : DEFAULT_CURRENCY;
}

function meta(code: string | null | undefined): PaymentCurrency {
  const c = (code ?? "").toUpperCase();
  return BY_CODE.get(c) ?? { code: c || DEFAULT_CURRENCY, label: c, symbol: c ? `${c} ` : "₹", exponent: 2, minMinor: 100 };
}

export function currencySymbol(code: string | null | undefined): string {
  return meta(code).symbol;
}

/** Major units (what a person types: 199, 19.99) to minor units. */
export function toMinor(major: number, code: string | null | undefined): number {
  return Math.round(major * 10 ** meta(code).exponent);
}

/** Minor units to major units, for Meta's value and for display. */
export function toMajor(minor: number, code: string | null | undefined): number {
  return minor / 10 ** meta(code).exponent;
}

/** The smallest charge Razorpay takes in this currency, in minor units. */
export function minChargeMinor(code: string | null | undefined): number {
  return meta(code).minMinor;
}

/** "₹1,999" / "$19.99" from minor units. Indian grouping for INR, Western for the rest. */
export function formatMoney(minor: number, code: string | null | undefined): string {
  const m = meta(code);
  const major = toMajor(minor, m.code);
  const whole = Number.isInteger(major);
  const text = major.toLocaleString(m.code === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: whole ? 0 : m.exponent,
    maximumFractionDigits: m.exponent,
  });
  return `${m.symbol}${text}`;
}

/** "₹1,999" from MAJOR units (rupees, dollars), for figures already divided down. */
export function formatMajor(major: number, code: string | null | undefined): string {
  return formatMoney(toMinor(major, code), code);
}
