import { NextResponse, type NextRequest } from "next/server";
import { resolveTenantFromHost } from "@/lib/tenant/resolve";
import { TENANT_HEADERS } from "@/lib/tenant/constants";

/**
 * Multi-tenant edge middleware.
 *
 * Resolves the tenant from the request host and injects tenant context into
 * request headers so Server Components / Actions can read it cheaply. Custom
 * domains are flagged here and mapped to a tenant later (DB lookup happens in
 * server code, which middleware cannot do at the edge).
 *
 * Kept intentionally light: pure host parsing, no DB, no auth — those layers
 * run downstream with the context this middleware provides.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";

  const { slug, source } = resolveTenantFromHost(host, rootDomain);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TENANT_HEADERS.slug, slug ?? "");
  requestHeaders.set(TENANT_HEADERS.source, source);
  requestHeaders.set(TENANT_HEADERS.host, host);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Skip tenant resolution for paths that never need it. Without this, every
  // asset/API request would run host parsing unnecessarily.
  //   _next        — Next.js build output, image optimizer, HMR
  //   api          — route handlers (incl. Better Auth) resolve context themselves
  //   favicon.ico, robots.txt, sitemap.xml — static crawler/browser assets
  //   .*\..*       — any file with an extension (images, fonts, css, js, ...)
  matcher: [
    "/((?!_next|api|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)",
  ],
};
