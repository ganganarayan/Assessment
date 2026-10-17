import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { buildImportSample } from "@/features/assessment/transfer/sample";

/**
 * The import sample, generated on request. GET /api/import-sample
 *
 * A tenant downloads this, hands it to whatever AI tool they use, and gets back a file
 * that imports without errors. It carries three things: what the format is (read off
 * the live Zod schema), a complete worked example (a real built-in template, parsed
 * through the real import parser), and the instructions to give the tool.
 *
 * 🔴 GENERATED, NEVER STORED. A checked-in sample file is a promise that somebody
 * updates it the day they add a field, and nobody does - so the first sign of drift is
 * a tenant whose AI-written import fails on a key the sample never mentioned. Building
 * it per request means staging and production each serve the sample for the code they
 * are actually running, with nothing to remember and nothing to regenerate.
 *
 * Signed-in callers only. It leaks no data - the example is a built-in template every
 * tenant can already see - but it describes the write surface, and that is not
 * something to hand to anonymous traffic.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  await requireUser();

  // The build that produced this, short form, so a stale download on somebody's desktop
  // can be told from a fresh one without opening it.
  const commit = (process.env.RAILWAY_GIT_COMMIT_SHA ?? "dev").slice(0, 7);

  let sample;
  try {
    sample = buildImportSample(commit);
  } catch (e) {
    // buildImportSample refuses to produce an example that would not import. That is a
    // bug in this app, not in the caller's request, so it says so plainly rather than
    // serving a sample that teaches the wrong shape.
    const message = e instanceof Error ? e.message : "The import sample could not be built.";
    console.error("[import-sample] refused to serve:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const filename = `assess360-import-sample-${commit}.json`;
  return new NextResponse(JSON.stringify(sample, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // Never cached: the point is that it tracks the running code.
      "cache-control": "no-store",
    },
  });
}
