import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/guards";
import { listSubmissionsForExport } from "@/features/admin/data/submissions-export";
import {
  SUBMISSION_EXPORT_COLUMNS,
  flattenSubmissionExportRow,
} from "@/features/admin/data/submissions-export-csv";
import { EXPORT_CAP } from "@/features/admin/data/analytics";
import { toCsv } from "@/lib/csv";
import { formatIST } from "@/lib/date";

/**
 * Tenant-scoped submissions export. GET /api/w/submissions/export?assessment=<id>&format=csv|json
 * — same shape as the super-admin export, but restricted to the signed-in
 * tenant's own submissions for the given assessment.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { tenantId } = await requireWorkspace();

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const assessmentId = url.searchParams.get("assessment");
  if (!assessmentId) {
    return NextResponse.json({ error: "Missing ?assessment=<id>" }, { status: 400 });
  }

  const rows = await listSubmissionsForExport({ tenantId, assessmentId });
  const stamp = formatIST(new Date()).slice(0, 10);
  const capped = rows.length >= EXPORT_CAP;
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
