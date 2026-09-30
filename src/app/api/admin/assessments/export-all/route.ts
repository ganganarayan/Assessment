import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import { ACTING_TENANT_COOKIE } from "@/lib/tenant/constants";
import { buildExportJson, buildExportCsv, exportFilename } from "@/features/assessment/transfer/export";

/**
 * Export ALL assessments in the unified format (same shape as single export).
 *   GET /api/admin/assessments/export-all?format=json|csv
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Scope the export, the same way the acting scope works everywhere else: a super
  // admin gets everything (or just the workspace they entered), a tenant admin gets
  // only their own. This used to be super-admin-only AND unfiltered, so opening it
  // to the workspace without this would hand one tenant every other tenant's
  // assessments. The tenant is re-read from the DB rather than trusted from the
  // session, which can be stale after a move between workspaces.
  let where: { tenantId?: string } = {};
  if (isSuperAdmin(user)) {
    const acting = (await cookies()).get(ACTING_TENANT_COOKIE)?.value || null;
    if (acting) where = { tenantId: acting };
  } else {
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tenantId: true },
    });
    if (!fresh?.tenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    where = { tenantId: fresh.tenantId };
  }

  const ids = (
    await prisma.assessment.findMany({ where, select: { id: true }, orderBy: { createdAt: "asc" } })
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
