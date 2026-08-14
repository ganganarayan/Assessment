import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import { formatIST } from "@/lib/date";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { getSubmissionQuestionBreakdown } from "@/features/admin/data/submission-questions";
import { renderReportPdf, type ReportData } from "@/lib/pdf/report";
import { renderClinicReportPdf, type ClinicReportData } from "@/lib/pdf/clinic-report";
import { computeResult } from "@/lib/scoring/clinic-audit";

/**
 * Branded PDF report for a completed submission.
 *   GET /api/reports/{submissionId}          → inline (view in browser)
 *   GET /api/reports/{submissionId}?download=1 → attachment (save)
 *
 * Generated on demand from the STORED snapshot + stored AI statement — no model
 * call, so every render is identical bytes.
 *
 * Auth: the platform owner (any submission), OR a tenant admin/staff viewing a
 * submission that belongs to THEIR OWN tenant. Previously this was super-admin-only,
 * so a tenant admin clicking "PDF" from their own /w/submissions got a 404 (visually
 * a blank page) even for their own workspace's data.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safeName = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Participant";

export async function GET(req: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
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
      assessment: {
        select: {
          title: true,
          engine: true,
          tenantId: true,
        },
      },
    },
  });
  const snap = (sub?.resultSnapshot ?? null) as ResultSnapshot | null;
  if (!sub || sub.status !== "COMPLETED" || !snap || typeof snap.scorePercent !== "number") {
    return NextResponse.json({ error: "No completed result for this submission." }, { status: 404 });
  }

  // Authorize: super admin (any), or a same-tenant admin/staff (their own workspace only).
  let authorized = isSuperAdmin(user);
  if (!authorized && sub.assessment.tenantId) {
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { tenantId: true } });
    authorized = fresh?.tenantId === sub.assessment.tenantId;
  }
  if (!authorized) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const firstName = sub.leadFirstName?.trim() || "Participant";
  const name = [sub.leadFirstName, sub.leadLastName].map((p) => p?.trim()).filter(Boolean).join(" ") || firstName;
  const dateIST = formatIST(sub.completedAt ?? sub.createdAt);

  let pdf: Buffer;
  if (sub.assessment.engine === "CLINIC_AUDIT" && snap.clinic) {
    // Clinic engine: the EXACT same calculation trail as the web result page (same
    // shared helpers, same figures, same "assumed" tags) — never the generic score/
    // category report (meaningless for clinic option values, which are rupees/rates,
    // not score points).
    const result = computeResult(snap.clinic.inputs, snap.clinic.config);
    const setting = sub.assessment.tenantId
      ? await prisma.appSetting.findUnique({ where: { tenantId: sub.assessment.tenantId }, select: { bookingUrl: true } })
      : null;
    const data: ClinicReportData = {
      name,
      profession: sub.leadProfession?.trim() || null,
      assessmentTitle: sub.assessment.title,
      dateIST,
      result,
      prose: snap.clinic.prose,
      bookingUrl: setting?.bookingUrl ?? null,
    };
    pdf = await renderClinicReportPdf(data);
  } else {
    // Per-question detail (text + chosen answer + score) — the FULL breakdown, merged
    // into each category by name.
    const breakdown = await getSubmissionQuestionBreakdown(submissionId);
    const qsByCategory = new Map(breakdown.map((b) => [b.name, b.questions]));

    const data: ReportData = {
      name,
      profession: sub.leadProfession?.trim() || null,
      assessmentTitle: sub.assessment.title,
      dateIST,
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
    pdf = await renderReportPdf(data);
  }

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
