import { NextResponse } from "next/server";

/** Unauthenticated connectivity check (no PII, no auth). */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { ok: true, service: "mentor", version: "v1" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
