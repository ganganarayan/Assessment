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
  });
}
