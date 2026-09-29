/**
 * Reconcile the app's opt-in numbers against what Meta reports.
 *
 * Read-only. Answers the question "Meta says N Complete Registrations, the Stats
 * page says 1 — where did the others come from?" by printing, for one window:
 *
 *   - which pixel id each tenant (and the SaaS funnel) fires, so it is visible
 *     when several assessments share ONE pixel — Meta counts per pixel, the Stats
 *     card counts per assessment;
 *   - submissions per assessment (the app's own "Opted in");
 *   - every CapiLog row, i.e. every event the SERVER actually sent to Meta and
 *     Meta's reply — anything Meta counted beyond these came from the browser
 *     (pixel auto-events, the pixel tester, another site on the same pixel) or is
 *     Meta's own modelled/view-through attribution;
 *   - page views (human vs bot) and gate rejections, for the funnel ratio.
 *
 * Usage (from a laptop; the public proxy swap is automatic):
 *   railway run -e <environment> -s Postgres npx tsx scripts/verify-optin-vs-meta.ts [YYYY-MM-DD]
 */
import "./public-db-url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** IST midnight of the given date (default: 7 days ago) as UTC. */
function windowStart(arg?: string): Date {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return new Date(`${arg}T00:00:00.000+05:30`);
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

async function main() {
  const from = windowStart(process.argv[2]);
  console.log(`Window: >= ${from.toISOString()} (${from.toString()})\n`);

  const settings = await prisma.appSetting.findMany({
    select: { id: true, tenantId: true, metaPixelId: true, platformPixelId: true },
  });
  console.log("== PIXEL IDS ==");
  for (const s of settings) {
    console.log(`  scope=${s.tenantId ?? "platform/Gita"}  assessment pixel=${s.metaPixelId ?? "(env fallback)"}  SaaS pixel=${s.platformPixelId ?? "-"}`);
  }

  const assessments = await prisma.assessment.findMany({
    select: { id: true, slug: true, title: true, tenantId: true, status: true, fireMetaCapi: true },
  });

  const subs = await prisma.submission.groupBy({ by: ["assessmentId"], where: { createdAt: { gte: from } }, _count: { _all: true } });
  console.log("\n== SUBMISSIONS (the app's \"Opted in\") ==");
  for (const s of [...subs].sort((a, b) => b._count._all - a._count._all)) {
    const a = assessments.find((x) => x.id === s.assessmentId);
    console.log(`  ${String(s._count._all).padStart(4)}  /${a?.slug ?? s.assessmentId}  tenant=${a?.tenantId ?? "platform"}  metaCapi=${a?.fireMetaCapi}`);
  }
  console.log(`  TOTAL ${subs.reduce((n, s) => n + s._count._all, 0)} across ${subs.length} assessment(s)`);

  const logs = await prisma.capiLog.findMany({
    where: { createdAt: { gte: from } },
    select: { createdAt: true, eventName: true, scope: true, status: true, httpStatus: true, tenantId: true, submissionId: true, autoFired: true, response: true },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n== CAPI LOG (what the server sent Meta) ==");
  for (const l of logs) {
    console.log(`  ${l.createdAt.toISOString()}  ${l.eventName.padEnd(22)} scope=${l.scope} ${l.status}/${l.httpStatus ?? "-"} auto=${l.autoFired} sub=${l.submissionId ?? "-"} ${(l.response ?? "").replace(/\s+/g, " ").slice(0, 100)}`);
  }
  const reg = logs.filter((l) => l.eventName === "CompleteRegistration");
  console.log(`  TOTAL ${logs.length} rows — CompleteRegistration: ${reg.length} (sent: ${reg.filter((r) => r.status === "sent").length})`);

  const pv = await prisma.pageView.groupBy({ by: ["assessmentId", "isBot"], where: { createdAt: { gte: from } }, _count: { _all: true } });
  console.log("\n== PAGE VIEWS ==");
  for (const p of [...pv].sort((a, b) => b._count._all - a._count._all)) {
    const a = assessments.find((x) => x.id === p.assessmentId);
    console.log(`  ${String(p._count._all).padStart(5)}  ${p.isBot ? "bot  " : "human"}  /${a?.slug ?? p.assessmentId}`);
  }

  const gd = await prisma.gateDisqualification.groupBy({ by: ["assessmentId", "repeat"], where: { createdAt: { gte: from } }, _count: { _all: true } });
  console.log("\n== GATE REJECTIONS ==");
  for (const g of gd) {
    const a = assessments.find((x) => x.id === g.assessmentId);
    console.log(`  ${String(g._count._all).padStart(4)}  repeat=${g.repeat}  /${a?.slug ?? g.assessmentId}`);
  }
  if (gd.length === 0) console.log("  (none)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
