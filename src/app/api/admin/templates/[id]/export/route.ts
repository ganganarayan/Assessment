import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import { EXPORT_SCHEMA_VERSION } from "@/features/assessment/transfer/schema";

/**
 * Download one template, for REVIEW.
 *   GET /api/admin/templates/<id>/export             the template document
 *   GET /api/admin/templates/<id>/export?format=assessment   its body as an import file
 *
 * Why this exists: the only other way to read a template's questions was to import it,
 * which creates a real assessment inside a workspace and counts against that plan's
 * cap - a side effect nobody wants from the act of checking whether the content is any
 * good. Reviewing is now a download.
 *
 * Two formats, because they answer two questions:
 *  - `template` (the default) is the document exactly as the repo holds it, so what the
 *    owner reads is byte-for-byte what the seeder will load. Reviewing a transformed
 *    copy would mean approving something other than what ships.
 *  - `assessment` is the body wrapped in the ordinary transfer envelope, so a reviewer
 *    can feed it to the normal Import screen in a throwaway workspace and WALK the
 *    funnel rather than read it.
 *
 * Super-admin only. Templates awaiting review include contributed ones, which are not
 * the platform's to hand out.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const t = await prisma.template.findUnique({
    where: { id },
    select: { slug: true, title: true, category: true, summary: true, shape: true, body: true, aiInstructions: true },
  });
  if (!t) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const asAssessment = new URL(req.url).searchParams.get("format") === "assessment";

  const payload = asAssessment
    ? {
        // The envelope the Import screen expects. schemaVersion is pinned to what the
        // importer validates, and is imported rather than retyped so the two cannot
        // drift into a file that will not load.
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        assessments: [t.body],
      }
    : {
        slug: t.slug,
        title: t.title,
        category: t.category,
        summary: t.summary,
        shape: t.shape,
        aiInstructions: t.aiInstructions,
        body: t.body,
      };

  const stem = `template-${t.slug}${asAssessment ? "-assessment" : ""}`.replace(/[^a-z0-9-]/gi, "-");
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${stem}.json"`,
      "cache-control": "no-store",
    },
  });
}
