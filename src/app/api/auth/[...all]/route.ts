import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { effectiveHost } from "@/lib/tenant/forwarded-host";
import { signupAllowedOnHost } from "@/lib/tenant/signup-host";

/** Catch-all Better Auth endpoint: /api/auth/* */
const handlers = toNextJsHandler(auth.handler);

export const GET = handlers.GET;

/**
 * Sign-up is refused on a TENANT's host, and refused HERE.
 *
 * Hiding the button and guarding the page are both worth doing and neither is the
 * guard: this endpoint is what creates the account, and it is reachable with a form
 * post from anywhere. Middleware cannot cover it either - the matcher excludes /api,
 * deliberately, because route handlers resolve their own context.
 *
 * Everything else on /api/auth passes straight through. Signing IN on a tenant's own
 * domain is exactly right: that is their workspace, and their people live there.
 */
export async function POST(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const isSignUp = path.includes("/sign-up");

  if (isSignUp && !(await signupAllowedOnHost(effectiveHost(request.headers)))) {
    return NextResponse.json(
      { error: "Accounts are created on the Assess360 site, not on this domain." },
      { status: 403 },
    );
  }

  return handlers.POST(request);
}
