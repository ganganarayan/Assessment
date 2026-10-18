import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * How an assessment body becomes a LIBRARY ROW.
 *
 * Both paths into the Template table need the same two answers - which shape is this,
 * and what slug is free - and they are in a plain module rather than in either action
 * file because a "use server" file may export nothing but async functions. Importing
 * `shapeOf` from one action file into the other compiles locally and then fails the
 * Railway build, which is exactly the kind of breakage that only shows up after a push.
 *
 * The two callers:
 *   - saveAsTemplate, a tenant saving their own funnel (private, or contributed)
 *   - promoteAssessmentToLibrary, the owner putting a platform funnel on the shelf
 */

/** Work out which shape a funnel actually IS, rather than asking somebody to classify
 *  their own assessment and getting it wrong. */
export function shapeOf(body: { qualification?: unknown; categories: Array<{ questions: unknown[] }> }):
  | "GATE_ONLY"
  | "GATED_ASSESSMENT"
  | "UNGATED_ASSESSMENT" {
  const q = body.qualification as { enabled?: boolean; questions?: unknown[] } | null | undefined;
  const gated = q?.enabled === true && (q.questions?.length ?? 0) > 0;
  const questions = body.categories.reduce((n, c) => n + c.questions.length, 0);
  if (gated && questions === 0) return "GATE_ONLY";
  return gated ? "GATED_ASSESSMENT" : "UNGATED_ASSESSMENT";
}

/** A free template slug derived from the assessment's own. The library slug is separate
 *  from any assessment slug, so collisions here only ever involve other templates. */
export async function freeTemplateSlug(base: string): Promise<string> {
  const stem = (base || "template").slice(0, 60);
  let candidate = stem;
  let n = 1;
  while (await prisma.template.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${stem}-${n}`;
    if (n > 200) return `${stem}-${Date.now()}`;
  }
  return candidate;
}
