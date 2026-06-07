import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  notifySubmissionCompleted,
  type SubmissionCompletedPayload,
} from "@/lib/crm/notify";

/**
 * Submission-completed hook (manual re-trigger / retry).
 *
 * POST { submissionId } -> rebuilds the canonical { assessment, lead, scores,
 * result } payload and dispatches it to the CRM webhook abstraction.
 *
 * SECURITY: this endpoint is fail-closed. It REQUIRES a shared secret
 * (CRM_HOOK_SECRET) via `Authorization: Bearer <secret>`. If the secret is not
 * configured, the endpoint refuses all requests. The response NEVER echoes the
 * lead PII payload back to the caller — only a delivery flag.
 *
 * Note: the normal public flow already fires this notification server-side on
 * completion (see actions/submission.ts); this route is only for ops/retries.
 */
export async function POST(req: Request) {
  const secret = process.env.CRM_HOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Hook not configured" },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { submissionId?: string };
  try {
    body = (await req.json()) as { submissionId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const submissionId = body.submissionId;
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assessment: { select: { id: true, slug: true, title: true } },
      resultBand: true,
      categoryScores: { include: { category: { select: { name: true } } } },
    },
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const total = submission.totalScore ?? 0;
  const max = submission.maxScore ?? 0;
  const payload: SubmissionCompletedPayload = {
    submissionId: submission.id,
    completedAt: (submission.completedAt ?? submission.createdAt).toISOString(),
    assessment: {
      id: submission.assessment.id,
      slug: submission.assessment.slug,
      title: submission.assessment.title,
    },
    lead: {
      firstName: submission.leadFirstName,
      lastName: submission.leadLastName,
      email: submission.leadEmail,
      mobile: submission.leadMobile,
    },
    scores: {
      total,
      max,
      percentage: max > 0 ? Math.round((total / max) * 10000) / 100 : 0,
      categories: submission.categoryScores.map((cs) => ({
        categoryId: cs.categoryId,
        name: cs.category.name,
        score: cs.score,
        maxScore: cs.maxScore,
      })),
    },
    result: submission.resultBand
      ? {
          level: submission.resultBand.level,
          title: submission.resultBand.title,
          description: submission.resultBand.description,
        }
      : null,
  };

  const { delivered } = await notifySubmissionCompleted(payload);
  // Do NOT echo the PII payload back to the caller.
  return NextResponse.json({ ok: true, delivered });
}
