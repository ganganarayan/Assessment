"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
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
  { const __d = editDenied(await requireSuperAdmin()); if (__d) return __d; }
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
  { const __d = editDenied(user); if (__d) return __d; }
  const parsed = parseImportText(raw, format);
  if (!parsed.ok) {
    return { ok: false, error: "Validation failed.", errors: parsed.errors };
  }

  const conflicts: string[] = [];
  const items: ImportItem[] = [];
  // Slugs already claimed by the DB or by an earlier entry in THIS file, so two
  // same-base entries can never resolve to the same slug (which would fail the
  // whole transaction on the unique constraint).
  const usedSlugs = new Set<string>();

  for (const body of parsed.data.assessments) {
    const taken = (await slugExists(body.slug)) || usedSlugs.has(body.slug);
    let finalSlug = body.slug;
    let replace = false;

    if (mode === "create") {
      if (taken) {
        conflicts.push(body.slug);
        continue;
      }
    } else if (mode === "copy") {
      if (taken) finalSlug = await generateCopySlug(body.slug, usedSlugs);
    } else {
      // replace: overwrite the matching DB slug; a same-slug in-file duplicate
      // becomes a copy so the two creates don't collide.
      replace = await slugExists(body.slug);
      while (usedSlugs.has(finalSlug)) finalSlug = await generateCopySlug(finalSlug, usedSlugs);
    }

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
  } catch (e) {
    const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "";
    if (code === "P2002") {
      return { ok: false, error: "Import failed: a slug collided during import. No changes were made." };
    }
    if (code === "P2028") {
      return { ok: false, error: "Import timed out — the file is too large for one transaction. No changes were made." };
    }
    return { ok: false, error: "Import failed; no changes were made." };
  }
}
