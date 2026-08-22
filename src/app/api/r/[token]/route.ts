import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isOriginAllowed } from "@/lib/result/cors";
import { readResult, chooseServedRow } from "@/lib/result/read";
import { rateLimit } from "@/lib/rate-limit";
import { loadPurchaseSettings, resolvePurchasePlan } from "@/lib/meta/capi-log";

/**
 * Public, latency-critical read endpoint the customer's destination page calls:
 *   GET /api/r/:token  -> the result snapshot (404 missing, 200 otherwise).
 *
 * LATEST-ONLY: the token identifies a PERSON (via its own row's identifierValue);
 * the page renders that person's NEWEST completed submission for the same
 * assessment, so a retake surfaces on the original (already-emailed/embedded)
 * token automatically. No expiry (see lib/result/read.ts). No version navigator —
 * exactly one reading (the newest) is ever exposed.
 *
 * Security is the unguessable token (no auth). CORS is PER-TENANT: the request
 * Origin is reflected ONLY if it matches the owning assessment's targetOrigin
 * (same assessment for every one of a person's submissions). Never wildcards.
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

interface TokenRow {
  id: string;
  tenantId: string | null;
  assessmentId: string;
  identifierValue: string | null;
  resultSnapshot: unknown;
  assessment: { targetOrigin: string | null; paidMode: boolean };
}

/** The token's own submission row (defines the person + the owning assessment). */
async function lookupToken(token: string): Promise<TokenRow | null> {
  return prisma.submission.findUnique({
    where: { resultToken: token },
    select: {
      id: true,
      tenantId: true,
      assessmentId: true,
      identifierValue: true,
      resultSnapshot: true,
      assessment: { select: { targetOrigin: true, paidMode: true } },
    },
  });
}

interface ServedRow {
  id: string;
  tenantId: string | null;
  resultSnapshot: unknown;
}

/**
 * The person's NEWEST completed reading for this assessment. Paid assessments key
 * on payment (completedPaidAt) so an unpaid draft never surfaces; free ones key on
 * completion. Null when the person has no completed reading (or the token row has
 * no identifier — anonymous, ungroupable), in which case the caller serves the
 * token's own row.
 */
async function newestForPerson(row: TokenRow): Promise<ServedRow | null> {
  if (!row.identifierValue) return null;
  const paid = row.assessment.paidMode;
  return prisma.submission.findFirst({
    where: paid
      ? { assessmentId: row.assessmentId, identifierValue: row.identifierValue, completedPaidAt: { not: null } }
      : { assessmentId: row.assessmentId, identifierValue: row.identifierValue, status: "COMPLETED" },
    orderBy: paid ? { completedPaidAt: "desc" } : { completedAt: "desc" },
    select: { id: true, tenantId: true, resultSnapshot: true },
  });
}

/** The tenant's booking/calendar link (per-tenant AppSetting), for the destination
 *  page's "Book a 1:1 Diagnosis Conversation" CTA. Null when unset. */
async function bookingUrlFor(tenantId: string | null): Promise<string | null> {
  if (!tenantId) return null;
  const s = await prisma.appSetting.findUnique({ where: { tenantId }, select: { bookingUrl: true } });
  return s?.bookingUrl ?? null;
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
  const sub = await lookupToken(token);
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

  const tokenRow = await lookupToken(token);
  // CORS is anchored to the token's assessment (shared by all the person's rows).
  const headers = corsHeaders(origin, tokenRow?.assessment.targetOrigin ?? null);

  // Resolve to the person's newest completed reading; fall back to the token's own
  // row when there's nothing newer (or it's anonymous).
  const newest = tokenRow ? await newestForPerson(tokenRow) : null;
  const served = chooseServedRow<ServedRow>(
    tokenRow ? { id: tokenRow.id, tenantId: tokenRow.tenantId, resultSnapshot: tokenRow.resultSnapshot } : null,
    newest,
  );

  const outcome = readResult(served);

  let body = outcome.body;
  if (outcome.status === 200 && served) {
    // Analytics count the SERVED row (the reading actually rendered).
    void prisma.submission
      .updateMany({ where: { id: served.id }, data: { resultFetchCount: { increment: 1 } } })
      .catch(() => {});
    void prisma.submission
      .updateMany({ where: { id: served.id, resultFetchedAt: null }, data: { resultFetchedAt: new Date() } })
      .catch(() => {});
    // Payment pixel is resolved for the SERVED submission so the browser Purchase
    // uses the matching event_id + name (Meta dedups on name+event_id).
    const pf = await purchaseFor(served.id);
    let purchase: { eventId: string; value: number | null; currency: string; eventName: string } | null = null;
    if (pf) {
      const { eventName } = resolvePurchasePlan(pf.value, await loadPurchaseSettings());
      purchase = { ...pf, eventName };
    }
    const bookingUrl = await bookingUrlFor(served.tenantId);
    body = { ...(outcome.body as Record<string, unknown>), purchase, bookingUrl };
  }

  return NextResponse.json(body, {
    status: outcome.status,
    headers: outcome.status === 200 ? { ...headers, "Cache-Control": "no-store" } : headers,
  });
}
