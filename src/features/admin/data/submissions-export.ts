import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { normalizeAttribution } from "@/lib/events/payload";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { EXPORT_CAP } from "@/features/admin/data/analytics";

export interface SubmissionExportCategory {
  name: string;
  score: number;
  max: number;
  band: string | null;
  meaning: string | null;
}
export interface SubmissionExportAi {
  source: string;
  isDefault: boolean;
  instruction: string | null;
  text: string;
  createdAtIST: string;
}
export interface SubmissionExportRow {
  submissionId: string;
  customerId: string | null;
  assessmentTitle: string;
  assessmentSlug: string;
  status: string;
  createdAtIST: string;
  completedAtIST: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  scoreRaw: number | null;
  max: number | null;
  scorePercent: number | null;
  overallBand: string | null;
  overallBandLevel: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbclid: string | null;
  gclid: string | null;
  categories: SubmissionExportCategory[];
  aiStatements: SubmissionExportAi[];
}

/** ALL submissions with their full results (categories + every AI version),
 *  newest first, for the Submissions export. */
export async function listSubmissionsForExport(): Promise<SubmissionExportRow[]> {
  const subs = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    take: EXPORT_CAP,
    select: {
      id: true,
      customerId: true,
      status: true,
      createdAt: true,
      completedAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      totalScore: true,
      maxScore: true,
      attribution: true,
      resultSnapshot: true,
      assessment: { select: { title: true, slug: true } },
      resultBand: { select: { level: true, title: true } },
      aiStatements: {
        orderBy: { createdAt: "asc" },
        select: { text: true, source: true, instruction: true, isDefault: true, createdAt: true },
      },
    },
  });

  return subs.map((s) => {
    const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
    const a = normalizeAttribution(s.attribution);
    const categories: SubmissionExportCategory[] = (snap?.categories ?? []).map((c) => ({
      name: c.name,
      score: c.score,
      max: c.max,
      band: c.band,
      meaning: c.meaning,
    }));
    // Every stored AI version; fall back to the snapshot's message if no rows exist.
    let aiStatements: SubmissionExportAi[] = s.aiStatements.map((v) => ({
      source: v.source,
      isDefault: v.isDefault,
      instruction: v.instruction,
      text: v.text,
      createdAtIST: formatIST(v.createdAt),
    }));
    if (aiStatements.length === 0 && snap?.aiStatement) {
      aiStatements = [
        { source: "ai", isDefault: true, instruction: null, text: snap.aiStatement, createdAtIST: formatIST(s.createdAt) },
      ];
    }

    return {
      submissionId: s.id,
      customerId: s.customerId,
      assessmentTitle: s.assessment.title,
      assessmentSlug: s.assessment.slug,
      status: s.status,
      createdAtIST: formatIST(s.createdAt),
      completedAtIST: s.completedAt ? formatIST(s.completedAt) : null,
      firstName: s.leadFirstName,
      lastName: s.leadLastName,
      email: s.leadEmail,
      phone: s.leadMobile,
      scoreRaw: snap?.scoreRaw ?? s.totalScore ?? null,
      max: snap?.max ?? s.maxScore ?? null,
      scorePercent: snap?.scorePercent ?? null,
      overallBand: s.resultBand?.title ?? snap?.resultBand ?? null,
      overallBandLevel: s.resultBand?.level ?? snap?.resultBandLevel ?? null,
      utm_source: a?.utm_source ?? null,
      utm_medium: a?.utm_medium ?? null,
      utm_campaign: a?.utm_campaign ?? null,
      utm_term: a?.utm_term ?? null,
      utm_content: a?.utm_content ?? null,
      fbclid: a?.fbclid ?? null,
      gclid: a?.gclid ?? null,
      categories,
      aiStatements,
    };
  });
}
