import { NextResponse } from "next/server";

/**
 * Public deploy fingerprint — GET /api/version.
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
    // Custom-domain provisioning readiness (booleans only — no secret values). Lets us
    // confirm which tokens/IDs are actually present in the runtime env.
    provisioning: {
      railwayToken: !!process.env.RAILWAY_API_TOKEN,
      railwayProjectId: !!process.env.RAILWAY_PROJECT_ID,
      railwayEnvironmentId: !!process.env.RAILWAY_ENVIRONMENT_ID,
      railwayServiceId: !!process.env.RAILWAY_SERVICE_ID,
      cloudflareToken: !!process.env.CLOUDFLARE_API_TOKEN,
    },
  });
}
