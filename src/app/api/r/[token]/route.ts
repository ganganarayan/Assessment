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
      resultSnapshot: true,
      resultTokenExpiresAt: true,
      assessment: { select: { targetOrigin: true } },
    },
  });
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
  return NextResponse.json(outcome.body, {
    status: outcome.status,
    headers: outcome.status === 200 ? { ...headers, "Cache-Control": "no-store" } : headers,
  });
}
