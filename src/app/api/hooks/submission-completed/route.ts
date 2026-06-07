import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  notifySubmissionCompleted,
  type SubmissionCompletedPayload,
} from "@/lib/crm/notify";

/**
 * Submission-completed hook.
 *
 * POST { submissionId } -> builds the canonical { assessment, lead, scores,
 * result } payload and dispatches it to the CRM webhook abstraction. Useful for
 * manual re-trigger / retries; the public flow already fires this on completion.
 *
 * Optional shared-secret: set CRM_HOOK_SECRET and send `Authorization: Bearer <secret>`.
 */
export async function POST(req: Request) {
  const secret = process.env.CRM_HOOK_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
      total: submission.totalScore ?? 0,
      max: submission.maxScore ?? 0,
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
  return NextResponse.json({ ok: true, delivered, payload });
}
