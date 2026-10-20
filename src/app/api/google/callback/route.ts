import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { resolveGoogleApp, exchangeCode, saveConnection } from "@/lib/google/oauth";
import { parseState } from "@/lib/google/state";
import { resetFreeBusyCache } from "@/lib/google/calendar";

/**
 * Where Google sends the browser back.
 *   GET /api/google/callback?code=...&state=...
 *
 * 🔴 EVERYTHING here is decided by the SIGNED state, never by the query. The workspace
 * and the calendar come out of the signature; without that, this endpoint would accept
 * an instruction from a stranger to attach their Google account to somebody else's
 * calendar. A tampered, forged or stale state is refused outright.
 *
 * There is no session check, deliberately: Google's redirect is a top-level navigation
 * that can land in a browser whose cookie has since expired, and failing on that would
 * strand a consent the person already gave. The signature is the authorisation, and it
 * carries everything a session would have told us.
 */
export const dynamic = "force-dynamic";

function back(path: string, status: "connected" | "failed", detail?: string): NextResponse {
  const url = new URL(path, env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("google", status);
  if (detail) url.searchParams.set("reason", detail.slice(0, 140));
  return NextResponse.redirect(url.toString(), { status: 302 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = parseState(url.searchParams.get("state") ?? "", env.BETTER_AUTH_SECRET);
  if (!state) {
    // With no trustworthy state there is no trustworthy place to return to either, so
    // this one case lands on a fixed path.
    return back("/w/calendar/availability", "failed", "That connection link was invalid or expired.");
  }

  // They declined on Google's screen, or Google refused.
  const denied = url.searchParams.get("error");
  if (denied) return back(state.returnTo, "failed", denied);

  const code = url.searchParams.get("code");
  if (!code) return back(state.returnTo, "failed", "Google sent no authorisation code.");

  const app = await resolveGoogleApp();
  if (!app) return back(state.returnTo, "failed", "The platform's Google app is not configured.");

  const tokens = await exchangeCode(app, code);
  if ("error" in tokens) return back(state.returnTo, "failed", tokens.error);

  /**
   * The key is "shared" or a staff id, and a staff id has to belong to this workspace.
   * Re-checked here rather than trusted from the state: the state was signed before the
   * consent screen, and a staff member can have been removed in between.
   */
  let userId: string | null = null;
  if (state.calendarKey !== "shared") {
    const staff = await prisma.user.findFirst({
      where: { id: state.calendarKey, tenantId: state.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!staff) return back(state.returnTo, "failed", "That person is no longer in this workspace.");
    userId = staff.id;
  }

  await saveConnection({ tenantId: state.tenantId, calendarKey: state.calendarKey, userId, tokens });
  resetFreeBusyCache();

  return back(state.returnTo, "connected");
}
