import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { type AssessmentBodyExport } from "./schema";
import { parseDocument, type ParseResult } from "./format";

export type { ParseResult };

/** Parse + validate an uploaded export (one JSON shape, one CSV shape). */
export const parseImportText = parseDocument;

export async function slugExists(slug: string): Promise<boolean> {
  return (await prisma.assessment.findUnique({ where: { slug }, select: { id: true } })) !== null;
}

/**
 * Generate a unique `…-copy` slug. `taken` lets the caller reserve slugs that
 * are being created in the same import but don't exist in the DB yet, so two
 * same-base entries in one file can't resolve to the same slug.
 */
export async function generateCopySlug(
  base: string,
  taken: Set<string> = new Set(),
): Promise<string> {
  let candidate = `${base}-copy`;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (taken.has(candidate) || (await slugExists(candidate))) {
    n += 1;
    candidate = `${base}-copy-${n}`;
  }
  return candidate;
}

const asJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

function createData(
  body: AssessmentBodyExport,
  finalSlug: string,
  userId: string | null,
  tenantId: string | null = null,
): Prisma.AssessmentCreateInput {
  const nextStep = body.nextStep ?? "DESTINATION";
  return {
    title: body.title,
    slug: finalSlug,
    description: body.description ?? null,
    coverImageUrl: body.coverImageUrl ?? null,
    estimatedMinutes: body.estimatedMinutes ?? null,
    thankYouMessage: body.thankYouMessage ?? null,
    collectFirstName: body.collectFirstName,
    firstNameRequired: body.firstNameRequired,
    collectLastName: body.collectLastName,
    lastNameRequired: body.lastNameRequired,
    collectEmail: body.collectEmail,
    emailRequired: body.emailRequired,
    collectMobile: body.collectMobile,
    mobileRequired: body.mobileRequired,
    collectProfession: body.collectProfession,
    professionRequired: body.professionRequired,
    // v2 fields (default when importing an older/CSV file that omits them).
    engine: body.engine ?? "GENERIC",
    engineConfig: asJson(body.engineConfig),
    eyebrow: body.eyebrow ?? null,
    subheadline: body.subheadline ?? null,
    buttonColor: body.buttonColor ?? null,
    buttonTextColor: body.buttonTextColor ?? null,
    heatmapCode: body.heatmapCode ?? null,
    firstNameLabel: body.firstNameLabel ?? null,
    lastNameLabel: body.lastNameLabel ?? null,
    emailLabel: body.emailLabel ?? null,
    mobileLabel: body.mobileLabel ?? null,
    professionLabel: body.professionLabel ?? null,
    professionPlaceholder: body.professionPlaceholder ?? null,
    professionOptions: body.professionOptions ?? [],
    leadCaptureAfter: body.leadCaptureAfter ?? false,
    preResultHeading: body.preResultHeading ?? null,
    preResultSubtext: body.preResultSubtext ?? null,
    preResultFields: asJson(body.preResultFields),
    optinFields: asJson(body.optinFields),
    introNotice: body.introNotice ?? null,
    startButtonLabel: body.startButtonLabel ?? null,
    resultsButtonLabel: body.resultsButtonLabel ?? null,
    useAiStatement: body.useAiStatement ?? true,
    nextStep,
    paidMode: nextStep === "PAYMENT",
    questionDisplayMode: body.questionDisplayMode ?? "ALL",
    ...(body.vslCountdownSeconds != null ? { vslCountdownSeconds: body.vslCountdownSeconds } : {}),
    status: "DRAFT",

    // The configuration the old format dropped. Spread conditionally so a file written by
    // the narrower export still imports and simply leaves these at their column defaults,
    // rather than overwriting them with nulls.
    ...(body.qualification != null ? { qualification: body.qualification as Prisma.InputJsonValue } : {}),
    ...(body.disqualifiedContent != null ? { disqualifiedContent: body.disqualifiedContent as Prisma.InputJsonValue } : {}),
    ...(body.audienceGate != null ? { audienceGate: body.audienceGate as Prisma.InputJsonValue } : {}),
    ...(body.resultPage != null ? { resultPage: body.resultPage as Prisma.InputJsonValue } : {}),
    ...(body.resultPagePublished != null ? { resultPagePublished: body.resultPagePublished as Prisma.InputJsonValue } : {}),
    ...(body.publishedPages != null ? { publishedPages: body.publishedPages as Prisma.InputJsonValue } : {}),
    ...(body.metaEvents != null ? { metaEvents: body.metaEvents as Prisma.InputJsonValue } : {}),
    ...(body.fireMetaCapi != null ? { fireMetaCapi: body.fireMetaCapi } : {}),
    ...(body.platformSignup != null ? { platformSignup: body.platformSignup } : {}),
    ...(body.retakePolicy ? { retakePolicy: body.retakePolicy } : {}),
    ...(body.retakeDays != null ? { retakeDays: body.retakeDays } : {}),
    ...(body.uniqueIdentifier ? { uniqueIdentifier: body.uniqueIdentifier } : {}),
    ...(body.trainingUrl != null ? { trainingUrl: body.trainingUrl } : {}),
    ...(body.targetUrl != null ? { targetUrl: body.targetUrl } : {}),
    ...(body.tokenTtlSeconds != null ? { tokenTtlSeconds: body.tokenTtlSeconds } : {}),
    ...(body.resultsContinueUrl != null ? { resultsContinueUrl: body.resultsContinueUrl } : {}),
    ...(body.resultsContinueLabel != null ? { resultsContinueLabel: body.resultsContinueLabel } : {}),
    ...(body.paymentUrl != null ? { paymentUrl: body.paymentUrl } : {}),
    ...(body.paymentReturnParam != null ? { paymentReturnParam: body.paymentReturnParam } : {}),
    ...(body.paymentHeadline != null ? { paymentHeadline: body.paymentHeadline } : {}),
    ...(body.paymentButtonLabel != null ? { paymentButtonLabel: body.paymentButtonLabel } : {}),
    ...(body.paymentAmount != null ? { paymentAmount: body.paymentAmount } : {}),
    ...(body.paymentEventName ? { paymentEventName: body.paymentEventName } : {}),
    ...(body.paymentIntroText != null ? { paymentIntroText: body.paymentIntroText } : {}),

    ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
    ...(tenantId ? { tenant: { connect: { id: tenantId } } } : {}),
    categories: {
      create: body.categories.map((c, ci) => ({
        name: c.name,
        description: c.description ?? null,
        displayOrder: ci,
        page: c.page ?? 1,
        questions: {
          create: c.questions.map((q, qi) => ({
            text: q.text,
            weight: q.weight,
            required: q.required,
            displayOrder: qi,
            scoringRole: q.scoringRole ?? null,
            scoringUnit: q.scoringUnit ?? null,
            options: {
              create: q.options.map((o, oi) => ({
                label: o.label,
                value: o.value,
                displayOrder: oi,
                diagnosisClause: o.diagnosisClause ?? null,
                isAssumption: o.isAssumption ?? false,
              })),
            },
          })),
        },
      })),
    },
    resultBands: {
      create: body.resultBands.map((b, bi) => ({
        level: b.level,
        title: b.title,
        description: b.description ?? null,
        minScore: b.minScore,
        maxScore: b.maxScore,
        displayOrder: bi,
      })),
    },
  };
}

export interface ImportItem {
  body: AssessmentBodyExport;
  finalSlug: string;
  replace: boolean;
}

/**
 * Import all assessments in ONE transaction - any failure rolls everything back
 * (no partial imports). For replace, the existing slug is deleted first (child
 * rows cascade via FK). A generous timeout covers large "Export All" payloads,
 * whose deeply-nested creates would otherwise exceed Prisma's 5s default.
 */
export interface ImportOutcome {
  count: number;
  /** Slugs that could not be replaced and were imported under a new name instead. */
  renamed: Array<{ from: string; to: string }>;
}

export async function performImportAll(
  items: ImportItem[],
  userId: string | null,
  tenantId: string | null = null,
): Promise<ImportOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const renamed: ImportOutcome["renamed"] = [];
      for (const item of items) {
        let slug = item.finalSlug;

        if (item.replace) {
          // Scope the replace to the acting tenant when importing into a workspace,
          // so a tenant can never delete another tenant's (or the platform's) slug.
          const removed = await tx.assessment.deleteMany({
            where: { slug, ...(tenantId ? { tenantId } : {}) },
          });

          // Deleted nothing, but the slug may still be taken by a row this caller is not
          // allowed to replace: another tenant's, or an unowned row left behind by an
          // import that predates owner stamping. Previously the create then hit the unique
          // constraint and the whole import died with "a slug collided during import",
          // which told the operator nothing about what to do next.
          //
          // So: import it under a free slug and SAY SO, rather than refusing. A renamed
          // import is recoverable in ten seconds; a failed one with an opaque message is
          // a support conversation.
          if (removed.count === 0) {
            const blocker = await tx.assessment.findUnique({ where: { slug }, select: { id: true } });
            if (blocker) {
              let n = 2;
              let candidate = `${slug}-${n}`;
              // Bounded so a pathological case cannot spin inside a transaction.
              while (n < 100 && (await tx.assessment.findUnique({ where: { slug: candidate }, select: { id: true } }))) {
                n += 1;
                candidate = `${slug}-${n}`;
              }
              renamed.push({ from: slug, to: candidate });
              slug = candidate;
            }
          }
        }

        await tx.assessment.create({ data: createData(item.body, slug, userId, tenantId) });
      }
      return { count: items.length, renamed };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}
