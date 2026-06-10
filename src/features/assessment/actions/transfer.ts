"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  parseImportText,
  slugExists,
  generateCopySlug,
  performImportAll,
  type ImportItem,
} from "@/features/assessment/transfer/import";
import type {
  ImportMode,
  ImportPreviewItem,
} from "@/features/assessment/transfer/schema";

type Format = "json" | "csv";

/** Validate an upload and return a per-assessment preview (or errors). */
export async function previewImport(
  raw: string,
  format: Format,
): Promise<ActionResult<ImportPreviewItem[]> & { errors?: string[] }> {
  await requireSuperAdmin();
  const parsed = parseImportText(raw, format);
  if (!parsed.ok) {
    return { ok: false, error: "Validation failed.", errors: parsed.errors };
  }

  const items: ImportPreviewItem[] = [];
  for (const a of parsed.data.assessments) {
    items.push({
      title: a.title,
      slug: a.slug,
      categoryCount: a.categories.length,
      questionCount: a.categories.reduce((n, c) => n + c.questions.length, 0),
      resultBandCount: a.resultBands.length,
      slugExists: await slugExists(a.slug),
    });
  }
  return { ok: true, data: items };
}

/** Import every assessment in the document, with one duplicate-slug policy. */
export async function importAssessments(
  raw: string,
  format: Format,
  mode: ImportMode,
): Promise<ActionResult<{ count: number }> & { errors?: string[] }> {
  const user = await requireSuperAdmin();
  const parsed = parseImportText(raw, format);
  if (!parsed.ok) {
    return { ok: false, error: "Validation failed.", errors: parsed.errors };
  }

  const conflicts: string[] = [];
  const items: ImportItem[] = [];
  const usedSlugs = new Set<string>();

  for (const body of parsed.data.assessments) {
    const exists = await slugExists(body.slug);
    let finalSlug = body.slug;
    let replace = false;

    if (exists) {
      if (mode === "create") {
        conflicts.push(body.slug);
        continue;
      }
      if (mode === "copy") finalSlug = await generateCopySlug(body.slug);
      if (mode === "replace") replace = true;
    }
    if (usedSlugs.has(finalSlug)) finalSlug = await generateCopySlug(finalSlug);
    usedSlugs.add(finalSlug);
    items.push({ body, finalSlug, replace });
  }

  if (mode === "create" && conflicts.length > 0) {
    return {
      ok: false,
      error: `These slugs already exist: ${conflicts.join(", ")}. Choose “Create copy” or “Replace existing”.`,
    };
  }

  try {
    const count = await performImportAll(items, user.id);
    revalidatePath("/admin/assessments");
    return { ok: true, data: { count } };
  } catch {
    return { ok: false, error: "Import failed; no changes were made." };
  }
}
