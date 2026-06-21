import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { type AiStatementRow } from "@/features/admin/actions/ai-statements";

/**
 * All versioned messages for a submission (oldest first). Lazy backfill: an
 * existing submission with a snapshot message but no version rows yet gets its
 * current message seeded as version 1 (default) the first time it's viewed —
 * so old contacts work without a bulk migration.
 */
export async function getAiStatements(submissionId: string): Promise<AiStatementRow[]> {
  let rows = await prisma.aiStatement.findMany({
    where: { submissionId },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) {
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { resultSnapshot: true },
    });
    const snap = (sub?.resultSnapshot ?? null) as ResultSnapshot | null;
    const existing = snap?.aiStatement?.trim();
    if (existing) {
      try {
        await prisma.aiStatement.create({
          data: { submissionId, text: existing, source: "ai", isDefault: true },
        });
      } catch (e) {
        // Only ignore a concurrent seed (unique default index); surface real errors.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
      }
      rows = await prisma.aiStatement.findMany({
        where: { submissionId },
        orderBy: { createdAt: "asc" },
      });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    source: r.source,
    instruction: r.instruction,
    isDefault: r.isDefault,
    createdAt: r.createdAt.toISOString(),
  }));
}
