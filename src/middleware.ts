import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { resolveTenantFromHost } from "@/lib/tenant/resolve";
import { TENANT_HEADERS } from "@/lib/tenant/constants";
import { ATTR_COOKIE, pickAttribution } from "@/lib/attribution";

/**
 * Multi-tenant + auth edge middleware.
 *
 * 1. Resolves the tenant from the request host and injects tenant context into
 *    request headers for downstream Server Components / Actions.
 * 2. Guards protected routes: unauthenticated users hitting /dashboard are
 *    redirected to /sign-in; authenticated users on /sign-in or /sign-up are
 *    sent to /dashboard.
 *
 * The session check here is an OPTIMISTIC cookie-presence check (no DB at the
 * edge). Full session validation happens in the page via getSession/requireUser.
 */
export function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const path = nextUrl.pathname;

  const host = request.headers.get("host") ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";
  const { slug, source } = resolveTenantFromHost(host, rootDomain);

  const hasSession = Boolean(getSessionCookie(request));
  const isProtected = path === "/dashboard" || path.startsWith("/dashboard/");
  const isAuthPage = path === "/sign-in" || path === "/sign-up";

  if (isProtected && !hasSession) {
    const url = nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasSession) {
    const url = nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TENANT_HEADERS.slug, slug ?? "");
  requestHeaders.set(TENANT_HEADERS.source, source);
  requestHeaders.set(TENANT_HEADERS.host, host);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // Marketing attribution (last-touch): whenever a visitor hits any app page
  // with UTM/click-id params, persist the latest set so it survives navigation
  // to the opt-in. The funnel reads this cookie when the opt-in URL has none.
  const attr = pickAttribution((k) => nextUrl.searchParams.get(k));
  if (Object.keys(attr).length > 0) {
    res.cookies.set(ATTR_COOKIE, JSON.stringify(attr), {
      maxAge: 60 * 60 * 24 * 90, // 90 days
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  return res;
}

export const config = {
  // Skip tenant/auth resolution for paths that never need it.
  //   _next        — Next.js build output, image optimizer, HMR
  //   api          — route handlers (incl. Better Auth) resolve context themselves
  //   favicon.ico, robots.txt, sitemap.xml — static crawler/browser assets
  //   .*\..*       — any file with an extension (images, fonts, css, js, ...)
  matcher: [
    "/((?!_next|api|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)",
  ],
};
