import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { authenticateApiToken } from "@/lib/api-auth/verify";
import {
  normalizeEmail,
  phoneDigits,
  phoneLast10,
  buildMetaMatchResponse,
  type MetaMatchRecord,
} from "@/lib/meta-match/lookup";

/**
 * Handler for the meta_match lookup. Version-agnostic — mounted by the route
 * files (canonical /api/v1/meta-match + the deprecated unversioned alias), so the
 * response contract can evolve behind a new version path without breaking wired
 * consumers.
 *
 * Auth is a scoped ApiToken (scope=meta_match); the token's tenant scopes the
 * lookup (null = platform). Key = email (primary) + phone last-10 (fallback).
 * Returns raw (unhashed) values in a stable shape; { found:false } / 200 when no
 * contact matches, so n8n can still fire a minimal event from Razorpay alone.
 */

const SELECT = {
  leadEmail: true,
  leadMobile: true,
  clientIp: true,
  userAgent: true,
  fbp: true,
  fbc: true,
  fbclidTimestamp: true,
  startedAt: true,
  attribution: true,
} as const;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function metaMatchGET(req: Request) {
  const auth = await authenticateApiToken(req, "meta_match");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  // Per-token + global fixed-window throttle (~once per purchase in normal use).
  if (!rateLimit(`meta-match:${auth.tokenId}`, 120) || !rateLimit("meta-match:global", 2000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: NO_STORE });
  }

  const url = new URL(req.url);
  const email = normalizeEmail(url.searchParams.get("email"));
  const last10 = phoneLast10(url.searchParams.get("phone"));
  if (!email && !last10) {
    return NextResponse.json({ error: "Provide email and/or phone." }, { status: 400, headers: NO_STORE });
  }

  // tenantId null = platform-owned rows; a tenant token restricts to its own.
  const tenantId = auth.tenantId;

  let rec: MetaMatchRecord | null = null;

  // Primary: exact (case-insensitive) email, most recent.
  if (email) {
    rec = await prisma.submission.findFirst({
      where: { tenantId, leadEmail: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    });
  }

  // Fallback: phone. `contains` narrows in SQL; we confirm the last-10 in JS so a
  // partial substring can't false-match.
  if (!rec && last10) {
    const cands = await prisma.submission.findMany({
      where: { tenantId, leadMobile: { contains: last10 } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: SELECT,
    });
    rec = cands.find((c) => (phoneDigits(c.leadMobile) ?? "").endsWith(last10)) ?? null;
  }

  return NextResponse.json(buildMetaMatchResponse(rec), { headers: NO_STORE });
}
