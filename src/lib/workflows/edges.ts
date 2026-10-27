import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Keep the edge rows saying the same thing as displayOrder.
 *
 * 🔴 WHY THIS EXISTS AT ALL, GIVEN NOTHING READS EDGES YET. The migration backfilled
 * them once. Without this, the first step anybody added afterwards would leave the
 * table describing a sequence that no longer exists - and a half-maintained table is
 * worse than no table, because the day the engine switches to reading edges it would
 * walk the old order and nobody would know why.
 *
 * So: displayOrder stays the truth, and this rewrites the edges to match after every
 * change. When the runner eventually follows edges instead, the two already agree and
 * the switch is one line rather than a data migration.
 *
 * Rewritten wholesale rather than diffed. A sequence is a handful of rows, and diffing
 * a reorder by hand is how an edge ends up pointing at a step in another workflow.
 */
export async function syncEdges(workflowId: string): Promise<void> {
  const steps = await prisma.workflowStep.findMany({
    where: { workflowId },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.workflowEdge.deleteMany({ where: { workflowId } }),
    ...steps.map((s, i) =>
      prisma.workflowEdge.create({
        data: {
          workflowId,
          // The first step's edge comes from the trigger, which is not a step, so null.
          fromStepId: i === 0 ? null : (steps[i - 1]?.id ?? null),
          toStepId: s.id,
          label: "NEXT",
        },
      }),
    ),
  ]);
}
