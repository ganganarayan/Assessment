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
 * 🔴 A NEW BUILT-IN ARRIVES UNPUBLISHED, AND NOTHING HERE CAN PUBLISH ONE.
 *
 * This is the guarantee that lets templates ship to production ahead of their review: a
 * seeded template is INVISIBLE to every tenant until the owner ticks Publish on it in
 * the console. Deploying the code therefore cannot put unreviewed content in front of a
 * customer, which decouples shipping the feature from approving the content.
 *
 * It was the other way round for exactly one commit - new built-ins arrived published,
 * on the reasoning that making the owner reveal work he had just written was ceremony.
 * That reasoning holds only when the owner has READ the template. He had not, and
 * "ships automatically" and "nobody has checked it" is the combination that puts
 * somebody else's questions on a customer's funnel.
 *
 * `published` is therefore absent from BOTH the create and the update paths. Absent
 * from create means the column default (false) applies; absent from update means a
 * published row stays published. There is no value of this function's input that
 * flips the flag either way - only the console can.
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
          // No `published` key: the column default (false) applies, so a freshly seeded
          // template exists, is reviewable in the console, and is visible to nobody.
          data: { slug: doc.slug, ...content, displayOrder: out.created },
        });
        out.created += 1;
      }
    } catch (e) {
      out.failed.push({ slug: doc.slug, error: e instanceof Error ? e.message : "write failed" });
    }
  }
  return out;
}
