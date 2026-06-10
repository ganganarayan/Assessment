import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";
import {
  exportAllJson,
  exportAllStructureCsv,
  exportResponsesCsv,
} from "@/features/assessment/transfer/export-bulk";

/**
 * Global export. Super-admin only.
 *   GET /api/admin/assessments/export-all?format=json|structure-csv|responses-csv
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isPlatformOwner(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const now = new Date().toISOString();

  let body: string;
  let filename: string;
  let contentType: string;

  if (format === "structure-csv") {
    body = await exportAllStructureCsv(now);
    filename = "assessments-structure.csv";
    contentType = "text/csv; charset=utf-8";
  } else if (format === "responses-csv") {
    body = await exportResponsesCsv();
    filename = "assessment-responses.csv";
    contentType = "text/csv; charset=utf-8";
  } else {
    body = await exportAllJson(now);
    filename = "assessments.json";
    contentType = "application/json; charset=utf-8";
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
