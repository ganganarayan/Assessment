"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  parseImportText,
  slugExists,
  generateCopySlug,
  performImport,
} from "@/features/assessment/transfer/import";
import type { ImportMode, ImportPreview } from "@/features/assessment/transfer/schema";

type Format = "json" | "csv";

/** Validate an uploaded export and return a preview (or validation errors). */
export async function previewImport(
  raw: string,
  format: Format,
): Promise<ActionResult<ImportPreview> & { errors?: string[] }> {
  await requireSuperAdmin();

  const parsed = parseImportText(raw, format);
  if (!parsed.ok) {
    return { ok: false, error: "Validation failed.", errors: parsed.errors };
  }

  const a = parsed.data.assessment;
  const preview: ImportPreview = {
    title: a.title,
    slug: a.slug,
    categoryCount: a.categories.length,
    questionCount: a.categories.reduce((n, c) => n + c.questions.length, 0),
    resultBandCount: a.resultBands.length,
    slugExists: await slugExists(a.slug),
  };
  return { ok: true, data: preview };
}

/** Import an assessment transactionally with duplicate-slug handling. */
export async function importAssessment(
  raw: string,
  format: Format,
  mode: ImportMode,
): Promise<ActionResult<{ id: string; slug: string }> & { errors?: string[] }> {
  const user = await requireSuperAdmin();

  const parsed = parseImportText(raw, format);
  if (!parsed.ok) {
    return { ok: false, error: "Validation failed.", errors: parsed.errors };
  }

  const baseSlug = parsed.data.assessment.slug;
  const exists = await slugExists(baseSlug);

  let finalSlug = baseSlug;
  if (exists) {
    if (mode === "create") {
      return {
        ok: false,
        error: "An assessment with this slug already exists. Choose “Create copy” or “Replace existing”.",
      };
    }
    if (mode === "copy") {
      finalSlug = await generateCopySlug(baseSlug);
    }
    // mode === "replace": keep baseSlug; existing row is deleted in the txn.
  } else if (mode === "copy") {
    finalSlug = await generateCopySlug(baseSlug);
  }

  try {
    const created = await performImport(parsed.data, mode, finalSlug, user.id);
    revalidatePath("/admin/assessments");
    return { ok: true, data: created };
  } catch {
    return { ok: false, error: "Import failed; no changes were made." };
  }
}
