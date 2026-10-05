import "server-only";
import { prisma } from "@/lib/db/prisma";
import { type AssessmentBodyExport } from "./schema";
import { bodiesToJson, bodiesToCsv } from "./format";

/**
 * Build the portable body for one assessment (ids/tenant/submissions stripped;
 * displayOrder renumbered). Returns null if it doesn't exist.
 */
async function buildAssessmentBody(
  id: string,
): Promise<AssessmentBodyExport | null> {
  const a = await prisma.assessment.findUnique({
    where: { id },
    include: {
      categories: {
        orderBy: { displayOrder: "asc" },
        include: {
          questions: {
            orderBy: { displayOrder: "asc" },
            include: { options: { orderBy: { displayOrder: "asc" } } },
          },
        },
      },
      resultBands: { orderBy: { displayOrder: "asc" } },
    },
  });
  if (!a) return null;

  return {
    title: a.title,
    slug: a.slug,
    description: a.description,
    coverImageUrl: a.coverImageUrl,
    estimatedMinutes: a.estimatedMinutes,
    thankYouMessage: a.thankYouMessage,
    collectFirstName: a.collectFirstName,
    firstNameRequired: a.firstNameRequired,
    collectLastName: a.collectLastName,
    lastNameRequired: a.lastNameRequired,
    collectEmail: a.collectEmail,
    emailRequired: a.emailRequired,
    collectMobile: a.collectMobile,
    mobileRequired: a.mobileRequired,
    collectProfession: a.collectProfession,
    professionRequired: a.professionRequired,
    // v2 fields (round-trip the engine + funnel copy).
    engine: a.engine,
    engineConfig: a.engineConfig ?? null,
    eyebrow: a.eyebrow,
    subheadline: a.subheadline,
    buttonColor: a.buttonColor,
    buttonTextColor: a.buttonTextColor,
    heatmapCode: a.heatmapCode,
    firstNameLabel: a.firstNameLabel,
    lastNameLabel: a.lastNameLabel,
    emailLabel: a.emailLabel,
    mobileLabel: a.mobileLabel,
    professionLabel: a.professionLabel,
    professionPlaceholder: a.professionPlaceholder,
    professionOptions: a.professionOptions,
    leadCaptureAfter: a.leadCaptureAfter,
    preResultHeading: a.preResultHeading,
    preResultSubtext: a.preResultSubtext,
    preResultFields: a.preResultFields ?? null,
    optinFields: a.optinFields ?? null,
    introNotice: a.introNotice,
    startButtonLabel: a.startButtonLabel,
    resultsButtonLabel: a.resultsButtonLabel,
    useAiStatement: a.useAiStatement,
    nextStep: a.nextStep,
    questionDisplayMode: a.questionDisplayMode,
    vslCountdownSeconds: a.vslCountdownSeconds,

    // Everything below was MISSING, and its absence is why an exported funnel arrived in
    // another environment as a shell: no gate, no exit page, no result page, no ad
    // configuration, and a file small enough to look broken. Thirty-four fields were being
    // dropped with no warning, which made "Export" a promise the format could not keep.
    //
    // Configuration only, deliberately. Submissions and stats have their own export pages
    // and their own formats; this one moves a funnel, not its data.
    qualification: a.qualification ?? null,
    disqualifiedContent: a.disqualifiedContent ?? null,
    audienceGate: a.audienceGate ?? null,
    resultPage: a.resultPage ?? null,
    resultPagePublished: a.resultPagePublished ?? null,
    publishedPages: a.publishedPages ?? null,
    metaEvents: a.metaEvents ?? null,
    fireMetaCapi: a.fireMetaCapi,
    platformSignup: a.platformSignup,
    retakePolicy: a.retakePolicy,
    retakeDays: a.retakeDays,
    uniqueIdentifier: a.uniqueIdentifier,
    trainingUrl: a.trainingUrl,
    targetUrl: a.targetUrl,
    tokenTtlSeconds: a.tokenTtlSeconds,
    resultsContinueUrl: a.resultsContinueUrl,
    resultsContinueLabel: a.resultsContinueLabel,
    paidMode: a.paidMode,
    paymentUrl: a.paymentUrl,
    paymentReturnParam: a.paymentReturnParam,
    paymentHeadline: a.paymentHeadline,
    paymentButtonLabel: a.paymentButtonLabel,
    paymentAmount: a.paymentAmount,
    paymentEventName: a.paymentEventName,
    paymentIntroText: a.paymentIntroText,
    categories: a.categories.map((c, ci) => ({
      name: c.name,
      description: c.description,
      displayOrder: ci,
      page: c.page,
      questions: c.questions.map((q, qi) => ({
        text: q.text,
        type: "SINGLE_SELECT" as const,
        weight: q.weight,
        required: q.required,
        displayOrder: qi,
        scoringRole: q.scoringRole,
        scoringUnit: q.scoringUnit,
        options: q.options.map((o, oi) => ({
          label: o.label,
          value: o.value,
          displayOrder: oi,
          diagnosisClause: o.diagnosisClause,
          isAssumption: o.isAssumption,
        })),
      })),
    })),
    resultBands: a.resultBands.map((b, bi) => ({
      level: b.level,
      title: b.title,
      description: b.description,
      minScore: b.minScore,
      maxScore: b.maxScore,
      displayOrder: bi,
    })),
  };
}

async function buildBodies(ids: string[]): Promise<AssessmentBodyExport[]> {
  const out: AssessmentBodyExport[] = [];
  for (const id of ids) {
    const b = await buildAssessmentBody(id);
    if (b) out.push(b);
  }
  return out;
}

/** THE JSON export (one assessment or many - same shape). */
export async function buildExportJson(
  ids: string[],
  exportedAt: string,
): Promise<string> {
  return bodiesToJson(await buildBodies(ids), exportedAt);
}

/** THE CSV export - same lossless schema for one assessment or many. */
export async function buildExportCsv(ids: string[]): Promise<string> {
  return bodiesToCsv(await buildBodies(ids));
}

export function exportFilename(stem: string, ext: "json" | "csv"): string {
  const safe = stem.replace(/[^a-z0-9-]/gi, "-");
  return `${safe}.${ext}`;
}
