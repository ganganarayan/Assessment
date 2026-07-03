import { NextResponse } from "next/server";

/** Unauthenticated connectivity check for n8n (no PII, no auth). */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, service: "meta-match" }, { headers: { "Cache-Control": "no-store" } });
}
