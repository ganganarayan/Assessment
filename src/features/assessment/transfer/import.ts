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
    useAiStatement: body.useAiStatement ?? true,
    nextStep,
    paidMode: nextStep === "PAYMENT",
    questionDisplayMode: body.questionDisplayMode ?? "ALL",
    ...(body.vslCountdownSeconds != null ? { vslCountdownSeconds: body.vslCountdownSeconds } : {}),
    status: "DRAFT",
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
 * Import all assessments in ONE transaction — any failure rolls everything back
 * (no partial imports). For replace, the existing slug is deleted first (child
 * rows cascade via FK). A generous timeout covers large "Export All" payloads,
 * whose deeply-nested creates would otherwise exceed Prisma's 5s default.
 */
export async function performImportAll(
  items: ImportItem[],
  userId: string | null,
  tenantId: string | null = null,
): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      for (const item of items) {
        if (item.replace) {
          // Scope the replace to the acting tenant when importing into a workspace,
          // so a tenant can never delete another tenant's (or the platform's) slug.
          await tx.assessment.deleteMany({
            where: { slug: item.finalSlug, ...(tenantId ? { tenantId } : {}) },
          });
        }
        await tx.assessment.create({ data: createData(item.body, item.finalSlug, userId, tenantId) });
      }
      return items.length;
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}
