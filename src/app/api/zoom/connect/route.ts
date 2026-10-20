import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { resolveActingScope, configTenantOf } from "@/lib/tenant/acting";
import { resolveZoomApp, zoomConsentUrl } from "@/lib/zoom/oauth";
import { buildState } from "@/lib/integrations/oauth-state";

/**
 * Start the Zoom connection for a workspace.
 *   GET /api/zoom/connect?returnTo=/w/automations
 *
 * Authorised as the owner through the acting scope, and the workspace rides in a SIGNED
 * state - never re-read from the callback's query, for the same reason Google's does.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = await resolveActingScope();
  if (!scope.canEdit) return NextResponse.json({ error: "View-only access." }, { status: 403 });
  const tenantId = configTenantOf(scope);

  const app = await resolveZoomApp();
  if (!app) {
    return NextResponse.json(
      { error: "Zoom is not set up on this platform yet. Add the Zoom app credentials first." },
      { status: 409 },
    );
  }

  const returnTo = new URL(req.url).searchParams.get("returnTo") ?? "/w/automations";
  const state = buildState({ tenantId, subject: "zoom", returnTo, issuedAtMs: Date.now() }, env.BETTER_AUTH_SECRET);
  return NextResponse.redirect(zoomConsentUrl(app, state), { status: 302 });
}
