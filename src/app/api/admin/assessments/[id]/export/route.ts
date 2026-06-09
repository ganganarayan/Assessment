import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";
import {
  buildAssessmentExport,
  exportToCsv,
  exportFilename,
} from "@/features/assessment/transfer/export";

/**
 * Download an assessment export. Super-admin (platform owner) only.
 *   GET /api/admin/assessments/<id>/export?format=json|csv
 * JSON is the authoritative, lossless format; CSV is for backup/reporting.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isPlatformOwner(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";

  const data = await buildAssessmentExport(id, new Date().toISOString());
  if (!data) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const filename = exportFilename(data.assessment.slug, format);
  const body = format === "csv" ? exportToCsv(data) : JSON.stringify(data, null, 2);
  const contentType =
    format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
