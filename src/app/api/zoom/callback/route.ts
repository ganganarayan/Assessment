import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { connectZoom } from "@/lib/zoom/oauth";
import { parseState } from "@/lib/integrations/oauth-state";

/**
 * Where Zoom sends the browser back.
 *   GET /api/zoom/callback?code=...&state=...
 *
 * 🔴 The workspace comes out of the SIGNED state and nowhere else. Without that, this
 * endpoint would accept a stranger's instruction to attach their Zoom account to
 * somebody else's workspace - and every meeting that workspace then created would be
 * hosted from the attacker's account.
 *
 * No session check, deliberately: an OAuth return is a top-level navigation that may
 * land in a browser whose cookie has expired, and failing there would strand a consent
 * already given.
 */
export const dynamic = "force-dynamic";

function back(path: string, status: "connected" | "failed", detail?: string): NextResponse {
  const url = new URL(path, env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("zoom", status);
  if (detail) url.searchParams.set("reason", detail.slice(0, 140));
  return NextResponse.redirect(url.toString(), { status: 302 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = parseState(url.searchParams.get("state") ?? "", env.BETTER_AUTH_SECRET);
  if (!state || state.subject !== "zoom") {
    return back("/w/automations", "failed", "That connection link was invalid or expired.");
  }

  const denied = url.searchParams.get("error");
  if (denied) return back(state.returnTo, "failed", denied);

  const code = url.searchParams.get("code");
  if (!code) return back(state.returnTo, "failed", "Zoom sent no authorisation code.");

  const result = await connectZoom(state.tenantId, code);
  if ("error" in result) return back(state.returnTo, "failed", result.error);
  return back(state.returnTo, "connected");
}
