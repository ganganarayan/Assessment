import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/guards";
import { buildExportJson, buildExportCsv, exportFilename } from "@/features/assessment/transfer/export";

/**
 * Tenant-scoped export of ONE assessment (same portable format as the admin route).
 * The assessment must belong to the acting workspace's tenant — a tenant can never
 * export another tenant's (or the platform's) assessment.
 *   GET /api/w/assessments/<id>/export?format=json|csv
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { tenantId } = await requireWorkspace();
  const { id } = await ctx.params;
  const a = await prisma.assessment.findUnique({ where: { id }, select: { slug: true, tenantId: true } });
  if (!a || a.tenantId !== tenantId) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

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
