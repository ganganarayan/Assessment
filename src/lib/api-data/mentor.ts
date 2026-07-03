import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { authenticateApiToken } from "@/lib/api-auth/verify";
import { normalizeEmail, buildMentorResponse, type MentorRecord } from "@/lib/mentor/read";

/**
 * Handler for the gita_mentor read. Version-agnostic — mounted by the route files
 * (canonical /api/v1/mentor + the deprecated unversioned alias).
 *
 * Tenant-scoped by the token. Returns the most recent COMPLETED result; if none
 * exists, { found:false } / 200 — the mentor's cue to ask the person to take the
 * assessment first, then re-fetch. Separate scope from meta_match: this key can
 * read results but NOT the marketing match fields, and vice versa.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function mentorGET(req: Request) {
  const auth = await authenticateApiToken(req, "gita_mentor");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!rateLimit(`mentor:${auth.tokenId}`, 240) || !rateLimit("mentor:global", 3000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: NO_STORE });
  }

  const email = normalizeEmail(new URL(req.url).searchParams.get("email"));
  if (!email) {
    return NextResponse.json({ error: "Provide email." }, { status: 400, headers: NO_STORE });
  }

  // Most recent COMPLETED result for this email, within the token's tenant scope.
  const row = await prisma.submission.findFirst({
    where: {
      tenantId: auth.tenantId,
      status: "COMPLETED",
      resultSnapshot: { not: Prisma.DbNull },
      leadEmail: { equals: email, mode: "insensitive" },
    },
    orderBy: { completedAt: "desc" },
    select: {
      leadEmail: true,
      leadFirstName: true,
      leadLastName: true,
      leadProfession: true,
      completedAt: true,
      resultSnapshot: true,
      assessment: { select: { slug: true, title: true } },
    },
  });

  const rec: MentorRecord | null = row
    ? {
        leadEmail: row.leadEmail,
        leadFirstName: row.leadFirstName,
        leadLastName: row.leadLastName,
        leadProfession: row.leadProfession,
        completedAt: row.completedAt,
        resultSnapshot: row.resultSnapshot,
        assessmentSlug: row.assessment?.slug ?? null,
        assessmentTitle: row.assessment?.title ?? null,
      }
    : null;

  return NextResponse.json(buildMentorResponse(rec), { headers: NO_STORE });
}
