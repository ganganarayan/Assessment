import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import {
  type WaTemplateRow,
  type WaTemplateStatusValue,
  type WaTemplateCategoryValue,
} from "@/features/wa-templates/types";

/** JSON out of the database is unknown until proved otherwise. */
const toSamples = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => (typeof v === "string" ? v : "")) : [];

/**
 * Every template this workspace has, drafts first.
 *
 * Drafts first on purpose: an approved template is finished and needs no attention,
 * while a draft and a rejection are both unfinished work. The order is what the owner
 * has left to do, not alphabetical.
 */
export async function listWaTemplates(tenantId: string): Promise<WaTemplateRow[]> {
  const rows = await prisma.waTemplate.findMany({
    where: { tenantId },
    orderBy: [{ updatedAt: "desc" }],
  });

  const rank: Record<WaTemplateStatusValue, number> = {
    REJECTED: 0,
    DRAFT: 1,
    PENDING: 2,
    PAUSED: 3,
    DISABLED: 4,
    APPROVED: 5,
  };

  return rows
    .map((r): WaTemplateRow => {
      const status = r.status as WaTemplateStatusValue;
      return {
        id: r.id,
        name: r.name,
        language: r.language,
        category: r.category as WaTemplateCategoryValue,
        headerText: r.headerText ?? "",
        bodyText: r.bodyText,
        footerText: r.footerText ?? "",
        sampleValues: toSamples(r.sampleValues),
        status,
        metaId: r.metaId,
        metaStatus: r.metaStatus,
        rejectedReason: r.rejectedReason,
        submittedLabel: r.submittedAt ? formatIST(r.submittedAt) : null,
        syncedLabel: r.syncedAt ? formatIST(r.syncedAt) : null,
        // Meta's key is the name and language together, so once it has them neither can
        // change: editing either would submit a SECOND template and leave this row
        // pointing at the first.
        submitted: Boolean(r.metaId) || r.status !== "DRAFT",
      };
    })
    .sort((a, b) => rank[a.status] - rank[b.status]);
}
