import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { listSubmissionsForExport } from "@/features/admin/data/submissions-export";
import {
  SUBMISSION_EXPORT_COLUMNS,
  flattenSubmissionExportRow,
} from "@/features/admin/data/submissions-export-csv";
import { EXPORT_CAP } from "@/features/admin/data/analytics";
import { toCsv } from "@/lib/csv";
import { formatIST } from "@/lib/date";

/**
 * Super-admin submissions export. GET /api/admin/submissions/export?format=csv|json[&assessment=<id>]
 * — every submission with its full result: score, overall band, result link,
 * UTMs, all category results, and ALL AI-statement versions. JSON keeps these
 * nested; CSV flattens categories + versions into single cells (one row per
 * submission). Optionally scoped to a single assessment.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireSuperAdmin();

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const assessmentId = url.searchParams.get("assessment") ?? undefined;
  // Scoped to one assessment: use ITS OWN "Data window" reset (or none), not the
  // platform-wide floor — matches what the scoped Submissions page shows on screen.
  const floor = assessmentId
    ? (await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { statsResetAt: true } }))
        ?.statsResetAt ?? null
    : undefined;
  const rows = await listSubmissionsForExport({ assessmentId, floor });
  const stamp = formatIST(new Date()).slice(0, 10);
  const capped = rows.length >= EXPORT_CAP;
  if (capped) console.warn(`[submissions-export] capped at ${EXPORT_CAP} rows`);
  const extra: Record<string, string> = capped ? { "x-export-capped": String(EXPORT_CAP) } : {};

  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="submissions-${stamp}.json"`,
        "cache-control": "no-store",
        ...extra,
      },
    });
  }

  return new NextResponse(toCsv(rows.map(flattenSubmissionExportRow), SUBMISSION_EXPORT_COLUMNS), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="submissions-${stamp}.csv"`,
      "cache-control": "no-store",
      ...extra,
    },
  });
}
