"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { parseAssessmentText } from "@/lib/import/parse-assessment-text";

/** Slugify a title the same way the rest of the app does (self-provision/platform). */
function slugify(seed: string): string {
  return seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/** A free (globally-unique) slug based on the title, suffixing -2, -3… as needed. */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "assessment";
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.assessment.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export interface ImportTextPreview {
  title: string;
  slug: string;
  categories: number;
  questions: number;
  options: number;
  categoryBands: number;
  overallBands: number;
  errors: string[];
  warnings: string[];
}

/** Parse + validate pasted text and return a preview (no writes). */
export async function previewAssessmentText(text: string): Promise<ActionResult<ImportTextPreview>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const { draft, errors, warnings } = parseAssessmentText(text);
  const categories = draft?.categories ?? [];
  const questions = categories.reduce((n, c) => n + c.questions.length, 0);
  const options = categories.reduce((n, c) => n + c.questions.reduce((m, q) => m + q.options.length, 0), 0);
  const categoryBands = categories.reduce((n, c) => n + c.bands.length, 0);

  return {
    ok: true,
    data: {
      title: draft?.title ?? "",
      slug: draft ? await uniqueSlug(draft.title) : "",
      categories: categories.length,
      questions,
      options,
      categoryBands,
      overallBands: draft?.overallBands.length ?? 0,
      errors,
      warnings,
    },
  };
}

/**
 * Create an assessment (DRAFT) from pasted text in ONE nested create — categories,
 * questions, options, per-category bands and overall result bands all in a single,
 * atomic statement. Refuses if the parser reported any error.
 */
export async function createAssessmentFromText(text: string): Promise<ActionResult<{ id: string; slug: string }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };

  const { draft, errors } = parseAssessmentText(text);
  if (errors.length > 0 || !draft) {
    return { ok: false, error: errors[0] ?? "Could not parse the assessment." };
  }

  const slug = await uniqueSlug(draft.title);

  const created = await prisma.assessment.create({
    data: {
      title: draft.title,
      slug,
      description: draft.description,
      status: "DRAFT",
      engine: "GENERIC",
      ...(scope.user.id ? { createdBy: { connect: { id: scope.user.id } } } : {}),
      ...(scope.tenantId ? { tenant: { connect: { id: scope.tenantId } } } : {}),
      categories: {
        create: draft.categories.map((c, ci) => ({
          name: c.name,
          displayOrder: ci,
          page: 1,
          questions: {
            create: c.questions.map((q, qi) => ({
              text: q.text,
              weight: 1,
              required: true,
              displayOrder: qi,
              options: {
                create: q.options.map((o, oi) => ({
                  label: o.label,
                  value: o.value,
                  displayOrder: oi,
                })),
              },
            })),
          },
          bands: {
            create: c.bands.map((b, bi) => ({
              label: b.label,
              meaning: b.meaning,
              minScore: b.min,
              maxScore: b.max,
              displayOrder: bi,
            })),
          },
        })),
      },
      resultBands: {
        create: draft.overallBands.map((b, bi) => ({
          level: b.level,
          title: b.title,
          description: b.description,
          minScore: b.min,
          maxScore: b.max,
          displayOrder: bi,
        })),
      },
    },
    select: { id: true, slug: true },
  });

  revalidatePath("/admin/assessment-builder");
  revalidatePath("/admin/assessments");
  revalidatePath("/w/assessments");
  return { ok: true, data: created };
}
