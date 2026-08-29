import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { normalizeAttribution } from "@/lib/events/payload";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { EXPORT_CAP } from "@/features/admin/data/analytics";
import { getPaidBySubmission } from "@/features/admin/data/payments";
import { getStatsFloor } from "@/lib/stats-floor";
import { labeledAnswers, labeledAnswersText } from "@/features/assessment/custom-fields";
import { resultUrlFor } from "@/lib/events/completion";

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
  profession: string | null;
  /** Custom opt-in + pre-results answers, flattened as "Label: value | Label: value". */
  customDetails: string;
  scoreRaw: number | null;
  max: number | null;
  scorePercent: number | null;
  overallBand: string | null;
  overallBandLevel: string | null;
  paidAmount: number | null;
  paidAtIST: string | null;
  resultUrl: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbclid: string | null;
  gclid: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  timezone: string | null;
  categories: SubmissionExportCategory[];
  aiStatements: SubmissionExportAi[];
}

export interface SubmissionExportFilter {
  /** Restrict to one tenant's submissions (via its assessments). */
  tenantId?: string;
  /** Restrict to one assessment's submissions. */
  assessmentId?: string;
  /** Explicit "Data window" floor to apply (createdAt >= floor). Pass `null`
   *  to disable filtering entirely. Omit to fall back to the global platform
   *  floor — only meaningful for the fully unscoped, platform-wide export. */
  floor?: Date | null;
}

/** Submissions with their full results (categories + every AI version),
 *  newest first, for the Submissions export. Optionally scoped to a tenant
 *  and/or a single assessment. */
export async function listSubmissionsForExport(
  filter: SubmissionExportFilter = {},
): Promise<SubmissionExportRow[]> {
  const floor = filter.floor !== undefined ? filter.floor : await getStatsFloor();
  const subs = await prisma.submission.findMany({
    where: {
      ...(floor ? { createdAt: { gte: floor } } : {}),
      ...(filter.assessmentId ? { assessmentId: filter.assessmentId } : {}),
      ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
    },
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
      leadProfession: true,
      optinAnswers: true,
      preResultAnswers: true,
      totalScore: true,
      maxScore: true,
      attribution: true,
      deviceType: true,
      browser: true,
      os: true,
      country: true,
      city: true,
      region: true,
      postalCode: true,
      timezone: true,
      resultSnapshot: true,
      resultToken: true,
      assessment: {
        select: { title: true, slug: true, targetUrl: true, optinFields: true, preResultFields: true },
      },
      resultBand: { select: { level: true, title: true } },
      aiStatements: {
        orderBy: { createdAt: "asc" },
        select: { text: true, source: true, instruction: true, isDefault: true, createdAt: true },
      },
    },
  });

  const paid = await getPaidBySubmission(subs.map((s) => s.id));

  return subs.map((s) => {
    const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
    const a = normalizeAttribution(s.attribution);
    const p = paid.get(s.id);
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
      profession: s.leadProfession,
      customDetails: labeledAnswersText(
        labeledAnswers({
          optinFields: s.assessment.optinFields,
          optinAnswers: s.optinAnswers,
          preResultFields: s.assessment.preResultFields,
          preResultAnswers: s.preResultAnswers,
        }),
      ),
      scoreRaw: snap?.scoreRaw ?? s.totalScore ?? null,
      max: snap?.max ?? s.maxScore ?? null,
      scorePercent: snap?.scorePercent ?? null,
      overallBand: s.resultBand?.title ?? snap?.resultBand ?? null,
      overallBandLevel: s.resultBand?.level ?? snap?.resultBandLevel ?? null,
      paidAmount: p?.amount ?? null,
      paidAtIST: p?.at ? formatIST(new Date(p.at)) : null,
      resultUrl: resultUrlFor(s.assessment.targetUrl, s.assessment.slug, s.id, s.resultToken),
      utm_source: a?.utm_source ?? null,
      utm_medium: a?.utm_medium ?? null,
      utm_campaign: a?.utm_campaign ?? null,
      utm_term: a?.utm_term ?? null,
      utm_content: a?.utm_content ?? null,
      fbclid: a?.fbclid ?? null,
      gclid: a?.gclid ?? null,
      device_type: s.deviceType,
      browser: s.browser,
      os: s.os,
      country: s.country,
      city: s.city,
      region: s.region,
      postal_code: s.postalCode,
      timezone: s.timezone,
      categories,
      aiStatements,
    };
  });
}
