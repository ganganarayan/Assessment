import { NextResponse } from "next/server";

/** Unauthenticated connectivity check for the mentor consumer (no PII, no auth). */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, service: "mentor" }, { headers: { "Cache-Control": "no-store" } });
}
