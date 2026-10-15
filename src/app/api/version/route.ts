import { NextResponse } from "next/server";

/**
 * Public deploy fingerprint - GET /api/version.
 * Echoes Railway's build-injected git metadata so a deploy can be verified from
 * outside (which commit is actually live), instead of guessing from health checks
 * or content-hashed asset names. Commit SHA + branch are not secrets.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    branch: process.env.RAILWAY_GIT_BRANCH ?? null,
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
    // Custom-domain provisioning readiness (booleans only - no secret values). Lets us
    // confirm which tokens/IDs are actually present in the runtime env.
    provisioning: {
      railwayToken: !!process.env.RAILWAY_API_TOKEN,
      railwayProjectId: !!process.env.RAILWAY_PROJECT_ID,
      railwayEnvironmentId: !!process.env.RAILWAY_ENVIRONMENT_ID,
      railwayServiceId: !!process.env.RAILWAY_SERVICE_ID,
      cloudflareToken: !!process.env.CLOUDFLARE_API_TOKEN,
      // Cloudflare for SaaS - the path that lifts Railway's per-service domain cap.
      // All four must be present AND the Worker deployed; the first three are what the
      // app can see, so `saasArmed` is "the app will take the custom-hostname path",
      // not "the whole chain works". The Worker half is proven by signing in on a
      // tenant's own host (docs/CUSTOM-DOMAINS.md), which is the only thing that shows
      // the proxy secret matches.
      cloudflareSaasZone: !!process.env.CLOUDFLARE_SAAS_ZONE_ID,
      cloudflareSaasFallback: !!process.env.CLOUDFLARE_SAAS_FALLBACK,
      cloudflareProxySecret: !!process.env.CLOUDFLARE_PROXY_SECRET,
      saasArmed:
        !!process.env.CLOUDFLARE_API_TOKEN &&
        !!process.env.CLOUDFLARE_SAAS_ZONE_ID &&
        !!process.env.CLOUDFLARE_SAAS_FALLBACK &&
        !!process.env.CLOUDFLARE_PROXY_SECRET,
    },
  });
}
