import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import { buildExportJson, buildExportCsv, exportFilename } from "@/features/assessment/transfer/export";

/**
 * Export ONE assessment in the unified format (same shape as Export All).
 *   GET /api/admin/assessments/<id>/export?format=json|csv
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const a = await prisma.assessment.findUnique({ where: { id }, select: { slug: true } });
  if (!a) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const now = new Date().toISOString();
  const body = format === "csv" ? await buildExportCsv([id]) : await buildExportJson([id], now);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(`assessment-${a.slug}`, format)}"`,
      "cache-control": "no-store",
    },
  });
}
