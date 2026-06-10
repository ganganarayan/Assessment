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

function createData(
  body: AssessmentBodyExport,
  finalSlug: string,
  userId: string | null,
): Prisma.AssessmentCreateInput {
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
    status: "DRAFT",
    ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
    categories: {
      create: body.categories.map((c, ci) => ({
        name: c.name,
        description: c.description ?? null,
        displayOrder: ci,
        questions: {
          create: c.questions.map((q, qi) => ({
            text: q.text,
            weight: q.weight,
            required: q.required,
            displayOrder: qi,
            options: {
              create: q.options.map((o, oi) => ({ label: o.label, value: o.value, displayOrder: oi })),
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
): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      for (const item of items) {
        if (item.replace) {
          await tx.assessment.deleteMany({ where: { slug: item.finalSlug } });
        }
        await tx.assessment.create({ data: createData(item.body, item.finalSlug, userId) });
      }
      return items.length;
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}
