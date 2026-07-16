import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";
import { formatIST } from "@/lib/date";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { getSubmissionQuestionBreakdown } from "@/features/admin/data/submission-questions";
import { renderReportPdf, type ReportData } from "@/lib/pdf/report";

/**
 * Branded PDF band report for a completed submission.
 *   GET /api/reports/{submissionId}          → inline (view in browser)
 *   GET /api/reports/{submissionId}?download=1 → attachment (save)
 *
 * Admin-only for now (platform owner session). Generated on demand from the STORED
 * snapshot + stored AI statement — no model call, so every render is identical
 * bytes. A long-lived token for CRM pickup is added when PDF delivery is built.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safeName = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Participant";

export async function GET(req: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isPlatformOwner(user.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { submissionId } = await params;
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      status: true,
      leadFirstName: true,
      leadLastName: true,
      leadProfession: true,
      completedAt: true,
      createdAt: true,
      aiStatement: true,
      reportNote: true,
      resultSnapshot: true,
      assessment: { select: { title: true } },
    },
  });
  const snap = (sub?.resultSnapshot ?? null) as ResultSnapshot | null;
  if (!sub || sub.status !== "COMPLETED" || !snap || typeof snap.scorePercent !== "number") {
    return NextResponse.json({ error: "No completed result for this submission." }, { status: 404 });
  }

  // Per-question detail (text + chosen answer + score) — the FULL breakdown, merged
  // into each category by name.
  const breakdown = await getSubmissionQuestionBreakdown(submissionId);
  const qsByCategory = new Map(breakdown.map((b) => [b.name, b.questions]));

  const firstName = sub.leadFirstName?.trim() || "Participant";
  const data: ReportData = {
    name: [sub.leadFirstName, sub.leadLastName].map((p) => p?.trim()).filter(Boolean).join(" ") || firstName,
    profession: sub.leadProfession?.trim() || null,
    assessmentTitle: sub.assessment.title,
    dateIST: formatIST(sub.completedAt ?? sub.createdAt),
    scorePercent: snap.scorePercent,
    bandTitle: snap.resultBand,
    bandLevel: snap.resultBandLevel ?? null,
    aiStatement: sub.aiStatement ?? snap.aiStatement ?? null,
    resultSuggestion: snap.resultSuggestion ?? null,
    reportNote: sub.reportNote ?? null,
    categories: Array.isArray(snap.categories)
      ? snap.categories.map((c) => ({
          name: c.name,
          score: c.score,
          max: c.max,
          band: c.band,
          questions: (qsByCategory.get(c.name) ?? []).map((q) => ({
            text: q.text,
            answer: q.answer,
            score: q.score,
            max: q.max,
          })),
        }))
      : [],
  };

  const pdf = await renderReportPdf(data);
  const download = new URL(req.url).searchParams.get("download") === "1";
  const disposition = `${download ? "attachment" : "inline"}; filename="Assess360_Report_${safeName(firstName)}.pdf"`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
