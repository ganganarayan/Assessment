import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Public read endpoint for the thank-you page's Meta browser↔server dedup.
 *
 * The browser Purchase pixel must fire with the SAME event_id the server CAPI
 * event uses, or Meta counts the sale twice. That id is the Razorpay payment id
 * (`pay_...`), which we already store on every captured payment as
 * `capiLog.providerPaymentId` (see lib/meta/capi-log.ts) — and the server fire
 * uses it as `eventId`. So this endpoint returns the newest captured payment in a
 * short time window, filtered by an amount band, and the browser fires the pixel
 * with `eventID = event_id`. Disjoint bands (₹499 booking vs ₹46k+ enrolment)
 * keep the two funnels from picking up each other's payment.
 *
 * Public, no auth, no PII in the response. Byte-for-byte: `event_id` is the exact
 * `pay_...` string — any transformation would break dedup.
 */

const ALLOWED_ORIGINS = new Set([
  "https://applygitawisdom.com",
  "https://www.applygitawisdom.com",
  "https://assess.applygitawisdom.com",
]);

const WINDOW_DEFAULT = 600;
const WINDOW_MAX = 1800;

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    h["Access-Control-Allow-Headers"] = "content-type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return (fwd.split(",")[0] ?? "").trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

/** Parse a non-negative number query param; returns fallback on missing/invalid. */
function num(v: string | null, fallback: number | null): number | null {
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function purchaseEventIdOPTIONS(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function purchaseEventIdGET(req: Request): Promise<NextResponse> {
  const cors = corsHeaders(req.headers.get("origin"));

  // Best-effort per-IP throttle (browser retries up to ~8×; 60/min is ample).
  if (!rateLimit(`purchase-eventid:${clientIp(req)}`, 60)) {
    return NextResponse.json({ found: false }, { status: 429, headers: cors });
  }

  const url = new URL(req.url);
  const windowSec = Math.min(num(url.searchParams.get("window"), WINDOW_DEFAULT) ?? WINDOW_DEFAULT, WINDOW_MAX);
  const min = num(url.searchParams.get("min"), 0) ?? 0;
  const max = num(url.searchParams.get("max"), null); // null = no upper bound

  const since = new Date(Date.now() - windowSec * 1000);
  // Amounts are stored in PAISE; the band is given in rupees.
  const amountPaise: { gte: number; lte?: number } = { gte: Math.round(min * 100) };
  if (max != null) amountPaise.lte = Math.round(max * 100);

  const row = await prisma.capiLog.findFirst({
    where: {
      providerPaymentId: { not: null },
      createdAt: { gte: since },
      amountPaise,
    },
    orderBy: { createdAt: "desc" },
    select: { providerPaymentId: true, amountPaise: true, currency: true, createdAt: true },
  });

  if (!row || row.providerPaymentId == null || row.amountPaise == null) {
    return NextResponse.json({ found: false }, { headers: cors });
  }

  return NextResponse.json(
    {
      found: true,
      // Exact Razorpay pay_... string = the CAPI event_id. Never transform.
      event_id: row.providerPaymentId,
      value: row.amountPaise / 100,
      currency: row.currency || "INR",
      age_seconds: Math.max(0, Math.round((Date.now() - row.createdAt.getTime()) / 1000)),
    },
    { headers: cors },
  );
}
