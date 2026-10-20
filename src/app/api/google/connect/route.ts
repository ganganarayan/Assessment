import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { resolveActingScope, configTenantOf } from "@/lib/tenant/acting";
import { resolveGoogleApp, consentUrl } from "@/lib/google/oauth";
import { buildState } from "@/lib/google/state";

/**
 * Start the Google connection for one calendar.
 *   GET /api/google/connect?calendar=<staff id|shared>&returnTo=/w/calendar/availability
 *
 * Authorised as the OWNER, through the ordinary acting scope, so a connection can only
 * ever be started for the workspace the person is actually in. The calendar being
 * connected rides in a SIGNED state and is never re-read from the callback's query.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = await resolveActingScope();
  if (!scope.canEdit) {
    return NextResponse.json({ error: "View-only access." }, { status: 403 });
  }
  const tenantId = configTenantOf(scope);

  const app = await resolveGoogleApp();
  if (!app) {
    // The platform owner has not set the Google app up yet. Said plainly, because the
    // person who can fix it is the one most likely to hit this.
    return NextResponse.json(
      { error: "Google is not set up on this platform yet. Add the Google app credentials first." },
      { status: 409 },
    );
  }

  const url = new URL(req.url);
  const calendar = (url.searchParams.get("calendar") ?? "shared").trim() || "shared";
  const returnTo = url.searchParams.get("returnTo") ?? "/w/calendar/availability";

  const state = buildState(
    { tenantId, calendarKey: calendar, returnTo, issuedAtMs: Date.now() },
    env.BETTER_AUTH_SECRET,
  );
  return NextResponse.redirect(consentUrl(app, state), { status: 302 });
}
