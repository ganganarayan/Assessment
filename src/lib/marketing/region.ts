import { headers } from "next/headers";
import { readGeoHeaders } from "@/lib/geo";
import type { Currency } from "./currency";

/**
 * Which currency to open the leak calculator in.
 *
 * Rupees are the default and the fallback, because this is an Indian product
 * sold mostly to Indian operators and because an unresolved country must not
 * silently redenominate the page.
 *
 * `resolved` is the honest half of the answer. Cloudflare's cf-ipcountry is the
 * only country signal we have, and it is absent whenever the request did not
 * come through Cloudflare, which includes the Railway domain and local work.
 * Rather than let a US reader see rupees in that case, the flag tells the client
 * component that nobody has actually decided yet, and it falls back to the
 * browser's own timezone. Two weak signals in sequence, both overridable by the
 * toggle on the calculator, and neither of them a network call.
 */
export async function detectCurrency(): Promise<{ currency: Currency; resolved: boolean }> {
  const h = await headers();
  const { country } = readGeoHeaders((k) => h.get(k));
  if (!country) return { currency: "INR", resolved: false };
  return { currency: country === "IN" ? "INR" : "USD", resolved: true };
}
