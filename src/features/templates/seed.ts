import "server-only";
import { prisma } from "@/lib/db/prisma";
import { templateDocSchema } from "@/features/templates/schema";
import { BUILTIN_TEMPLATE_DOCS } from "@/features/templates/builtin";
import { type ReseedResult } from "@/features/templates/types";

/**
 * Seed (and re-seed) the built-in templates from the JSON files in
 * src/features/templates/builtin.
 *
 * WHY THE FILES ARE THE SOURCE OF TRUTH: a template is content, content drifts, and a
 * library that only exists in a database cannot be reviewed in a diff. Keeping them in
 * git means a wrong question gets fixed in a commit like everything else.
 *
 * WHAT A RE-SEED WILL NOT TOUCH: `published` and `displayOrder`. Those are the owner's
 * shelf decisions, made in the console, and a deploy that silently un-published the
 * library (or re-ordered it) would be a self-inflicted outage of the one screen a new
 * customer sees first. Everything else - title, summary, category, shape, body, prompt -
 * is overwritten from the file, because that is what versioning the content is for.
 *
 * A NEW built-in arrives PUBLISHED. The owner authored it; making them tick a box to
 * reveal work they just wrote is ceremony, and the one time it is forgotten the library
 * ships empty.
 *
 * Idempotent, keyed on slug, and per-row fail-soft: one malformed file reports itself
 * and the other seven still land.
 */
export async function seedBuiltinTemplates(): Promise<ReseedResult> {
  const out: ReseedResult = { created: 0, updated: 0, failed: [] };

  for (const raw of BUILTIN_TEMPLATE_DOCS) {
    const parsed = templateDocSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path?.length ? ` at ${issue.path.join(".")}` : "";
      const slug = (raw as { slug?: unknown })?.slug;
      out.failed.push({
        slug: typeof slug === "string" ? slug : "(unnamed)",
        error: `${issue?.message ?? "invalid"}${where}`,
      });
      continue;
    }
    const doc = parsed.data;
    try {
      const existing = await prisma.template.findUnique({
        where: { slug: doc.slug },
        select: { id: true },
      });
      const content = {
        title: doc.title,
        category: doc.category,
        summary: doc.summary ?? null,
        shape: doc.shape,
        body: doc.body as object,
        aiInstructions: doc.aiInstructions ?? null,
        builtin: true,
        // A built-in belongs to the platform, never to a workspace, and is never
        // awaiting review. Stated on every seed so a row that was somehow written
        // otherwise is corrected rather than left half-wrong.
        ownerTenantId: null,
        reviewStatus: "APPROVED" as const,
      };
      if (existing) {
        await prisma.template.update({ where: { slug: doc.slug }, data: content });
        out.updated += 1;
      } else {
        await prisma.template.create({
          data: { slug: doc.slug, ...content, published: true, displayOrder: out.created },
        });
        out.created += 1;
      }
    } catch (e) {
      out.failed.push({ slug: doc.slug, error: e instanceof Error ? e.message : "write failed" });
    }
  }
  return out;
}
