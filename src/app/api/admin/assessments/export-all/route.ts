import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import { buildExportJson, buildExportCsv, exportFilename } from "@/features/assessment/transfer/export";

/**
 * Export ALL assessments in the unified format (same shape as single export).
 *   GET /api/admin/assessments/export-all?format=json|csv
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ids = (
    await prisma.assessment.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } })
  ).map((a) => a.id);

  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const now = new Date().toISOString();
  const body = format === "csv" ? await buildExportCsv(ids) : await buildExportJson(ids, now);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename("assessments", format)}"`,
      "cache-control": "no-store",
    },
  });
}
