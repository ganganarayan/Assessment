import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isOriginAllowed } from "@/lib/result/cors";
import { readResult } from "@/lib/result/read";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Public, latency-critical read endpoint the customer's destination page calls:
 *   GET /api/r/:token  -> the result snapshot (404 missing, 410 expired).
 *
 * Security is the unguessable, expiring token (no auth). CORS is PER-TENANT:
 * the request Origin is reflected ONLY if it matches the owning assessment's
 * targetOrigin (derived from its Target URL). Never wildcards. GET/OPTIONS only.
 * One indexed query by token; the payload is a denormalized snapshot (no joins
 * beyond a shallow targetOrigin read for CORS).
 */
export const dynamic = "force-dynamic";

function corsHeaders(origin: string | null, allowedOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (isOriginAllowed(origin, [allowedOrigin])) {
    headers["Access-Control-Allow-Origin"] = origin as string;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

/**
 * Best-effort throttle: a global cap (blunts IP-spoofed bulk probing since the
 * leftmost X-Forwarded-For is client-controlled) plus a per-claimed-IP cap.
 */
function throttled(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const global = !rateLimit("r:global", 3000);
  const perIp = !rateLimit(`r:ip:${ip}`, 120);
  return global || perIp;
}

async function lookup(token: string) {
  return prisma.submission.findUnique({
    where: { resultToken: token },
    select: {
      id: true,
      resultSnapshot: true,
      resultTokenExpiresAt: true,
      assessment: { select: { targetOrigin: true } },
    },
  });
}

/** The captured payment for a submission, shaped for the connector's browser
 *  Purchase pixel (deduped server-side via the same event_id). Null when unpaid. */
async function purchaseFor(submissionId: string): Promise<{ eventId: string; value: number | null; currency: string } | null> {
  const p = await prisma.payment.findFirst({
    where: { submissionId, purpose: "assessment_unlock", status: "captured", providerPaymentId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { providerPaymentId: true, amount: true, currency: true },
  });
  if (!p?.providerPaymentId) return null;
  return { eventId: p.providerPaymentId, value: p.amount != null ? p.amount / 100 : null, currency: p.currency };
}

export async function OPTIONS(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (throttled(req)) return new NextResponse(null, { status: 429 });
  const { token } = await ctx.params;
  const origin = req.headers.get("origin");
  const sub = await lookup(token);
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin, sub?.assessment.targetOrigin ?? null),
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const origin = req.headers.get("origin");

  if (throttled(req)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sub = await lookup(token);
  const headers = corsHeaders(origin, sub?.assessment.targetOrigin ?? null);

  const outcome = readResult(sub, Date.now());

  // Analytics: count EVERY successful fetch (one per VSL page load) and stamp the
  // first one. Fire-and-forget; never delays or fails the read.
  let body = outcome.body;
  if (outcome.status === 200 && sub) {
    void prisma.submission
      .updateMany({ where: { resultToken: token }, data: { resultFetchCount: { increment: 1 } } })
      .catch(() => {});
    void prisma.submission
      .updateMany({ where: { resultToken: token, resultFetchedAt: null }, data: { resultFetchedAt: new Date() } })
      .catch(() => {});
    // Attach the payment id (if paid) so the destination page can fire the browser
    // Purchase pixel with the matching event_id (deduped vs the server CAPI event).
    const purchase = await purchaseFor(sub.id);
    body = { ...(outcome.body as Record<string, unknown>), purchase };
  }

  return NextResponse.json(body, {
    status: outcome.status,
    headers: outcome.status === 200 ? { ...headers, "Cache-Control": "no-store" } : headers,
  });
}
