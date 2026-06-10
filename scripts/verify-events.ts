/**
 * Event Engine verification harness — proves Phase 1 end-to-end against a real
 * database, using the SAME code paths the app uses (startSubmission,
 * completeSubmission, markResultViewed, sweepAbandoned, emitEvent, webhook
 * dispatch + HMAC). Prints evidence for all 8 checks.
 *
 * Run where the DB is reachable (e.g. a Railway shell / one-off):
 *   npx tsx scripts/verify-events.ts
 * Keep the test data for manual inspection:
 *   VERIFY_KEEP=1 npx tsx scripts/verify-events.ts
 *
 * Safe on staging: it spins an in-process webhook receiver, TEMPORARILY points
 * the assessment.completed endpoint at it (restored afterwards, so real CRM is
 * never hit with test data), and deletes all test rows at the end.
 */
import http from "node:http";
import { AddressInfo } from "node:net";
import { EventType } from "@prisma/client";
import { prisma } from "../src/lib/db/prisma";
import {
  startSubmission,
  completeSubmission,
} from "../src/features/assessment/actions/submission";
import { markResultViewed } from "../src/features/events/record";
import { sweepAbandoned } from "../src/lib/events/abandoned";
import { signWebhookBody, generateWebhookSecret } from "../src/lib/webhooks/sign";

const KEEP = process.env.VERIFY_KEEP === "1";
const SLUG = `verify-events-${Date.now()}`;
const line = (s = "") => console.log(s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Received { event: string | null; body: string; signature: string | null }

async function main() {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({
        event: req.headers["x-assess-event"] as string,
        signature: (req.headers["x-assess-signature"] as string) ?? null,
        body,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const receiverUrl = `http://127.0.0.1:${port}/hook`;

  let createdAssessmentId: string | null = null;
  let submissionId: string | null = null;
  let oldSubmissionId: string | null = null;
  const originalEndpoint = await prisma.webhook.findUnique({
    where: { name: "assessment.completed" },
  });

  try {
    line("============ CHECK 1: EventLog total count ============");
    line(`EventLog rows (before test): ${await prisma.eventLog.count()}`);

    line("\n============ CHECK 2: EventLog records by type (baseline) ============");
    for (const g of await prisma.eventLog.groupBy({ by: ["type"], _count: { _all: true } })) {
      line(`  ${g.type.padEnd(22)} ${g._count._all}`);
    }

    line("\n============ CHECK 6: seeded CRM endpoint (assessment.completed) ============");
    line(
      originalEndpoint
        ? `  FOUND  url=${originalEndpoint.url}  status=${originalEndpoint.status}  hasSecret=${Boolean(originalEndpoint.secret)}`
        : "  NONE (run `npm run seed:webhooks` with CRM_WEBHOOK_URL set)",
    );

    // Temporarily redirect assessment.completed -> in-process receiver.
    const testSecret = generateWebhookSecret();
    await prisma.webhook.upsert({
      where: { name: "assessment.completed" },
      update: { url: receiverUrl, secret: testSecret, status: "ACTIVE" },
      create: { name: "assessment.completed", url: receiverUrl, secret: testSecret, status: "ACTIVE" },
    });
    line(`\n(temporarily pointed assessment.completed -> ${receiverUrl})`);

    // Build a published test assessment: 1 category, 2 questions (1..4), 2 bands.
    const opts = () => ({
      create: [1, 2, 3, 4].map((v) => ({ label: `v${v}`, value: v, displayOrder: v - 1 })),
    });
    const created = await prisma.assessment.create({
      data: {
        slug: SLUG,
        title: "Verify Events",
        status: "PUBLISHED",
        collectEmail: true,
        emailRequired: false,
        categories: {
          create: [
            {
              name: "Cat",
              displayOrder: 0,
              questions: {
                create: [
                  { text: "Q1", weight: 1, required: true, displayOrder: 0, options: opts() },
                  { text: "Q2", weight: 1, required: true, displayOrder: 1, options: opts() },
                ],
              },
            },
          ],
        },
        resultBands: {
          create: [
            { level: "LOW", title: "Low", minScore: 0, maxScore: 49, displayOrder: 0 },
            { level: "HIGH", title: "High", minScore: 50, maxScore: 100, displayOrder: 1 },
          ],
        },
      },
      include: { categories: { include: { questions: { include: { options: true } } } } },
    });
    createdAssessmentId = created.id;

    line("\n============ CHECK 3: create a submission & show emitted events ============");
    const start = await startSubmission(SLUG, {
      firstName: "Verify",
      lastName: "Bot",
      email: "verify@example.com",
      mobile: "",
    });
    if (!start.ok || !start.data) throw new Error(`startSubmission failed: ${!start.ok ? start.error : "no data"}`);
    submissionId = start.data.submissionId;
    line(`  startSubmission -> ${submissionId}`);

    const questions = created.categories.flatMap((c) => c.questions);
    const answers = questions.map((q) => ({
      questionId: q.id,
      optionId: q.options.find((o) => o.value === 4)!.id, // max -> 100% -> HIGH
    }));
    const complete = await completeSubmission(submissionId, { answers });
    if (!complete.ok) throw new Error(`completeSubmission failed: ${complete.error}`);
    line("  completeSubmission -> ok");

    // assessment.completed dispatch is non-blocking; wait for the WebhookLog row.
    for (let i = 0; i < 25 && received.length === 0; i++) await sleep(200);

    const subEvents = await prisma.eventLog.findMany({
      where: { submissionId },
      orderBy: { createdAt: "asc" },
      select: { name: true, createdAt: true },
    });
    line("  EventLog rows for this submission (expect lead.created, assessment.started, assessment.completed, result.generated):");
    for (const e of subEvents) line(`    ${e.createdAt.toISOString()}  ${e.name}`);

    line("\n============ CHECK 4 & 5: assessment.completed -> webhook dispatch + WebhookLog ============");
    const whlogs = await prisma.webhookLog.findMany({
      where: { submissionId },
      orderBy: { createdAt: "asc" },
    });
    for (const w of whlogs) {
      line(`  ${w.eventName}  status=${w.responseStatus}  success=${w.success}  attempts=${w.attemptCount}  endpoint=${w.endpoint}`);
    }
    const got = received.find((r) => r.event === "assessment.completed");
    if (got) {
      const expected = signWebhookBody(testSecret, got.body);
      line(`  receiver got assessment.completed: YES`);
      line(`  HMAC signature valid: ${expected === got.signature ? "YES ✓" : "NO ✗"}`);
    } else {
      line("  receiver got assessment.completed: NO");
    }

    line("\n============ CHECK 7: result.viewed recorded only once ============");
    await markResultViewed(submissionId);
    await markResultViewed(submissionId); // second call must be a no-op
    const rvCount = await prisma.eventLog.count({
      where: { submissionId, type: EventType.RESULT_VIEWED },
    });
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { resultViewedAt: true },
    });
    line(`  markResultViewed called twice`);
    line(`  result.viewed EventLog rows: ${rvCount} (expect 1)`);
    line(`  submission.resultViewedAt: ${sub?.resultViewedAt?.toISOString() ?? "null"}`);

    line("\n============ CHECK 8: assessment.abandoned sweep ============");
    await prisma.appSetting.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
    const setting = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
    const oldSub = await prisma.submission.create({
      data: {
        assessmentId: created.id,
        status: "STARTED",
        leadEmail: "abandon@example.com",
        startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
      },
      select: { id: true },
    });
    oldSubmissionId = oldSub.id;
    line(`  created STARTED submission ${oldSub.id} startedAt=48h ago (delay=${setting?.abandonedAfterHours}h)`);
    const sweep = await sweepAbandoned();
    line(`  sweepAbandoned -> scanned=${sweep.scanned} swept=${sweep.swept}`);
    const oldAfter = await prisma.submission.findUnique({
      where: { id: oldSub.id },
      select: { abandonedAt: true, status: true },
    });
    const abCount = await prisma.eventLog.count({
      where: { submissionId: oldSub.id, type: EventType.ASSESSMENT_ABANDONED },
    });
    line(`  test submission abandonedAt: ${oldAfter?.abandonedAt?.toISOString() ?? "null"}`);
    line(`  assessment.abandoned EventLog rows for it: ${abCount} (expect 1)`);

    line("\n============ Final EventLog total ============");
    line(`EventLog rows (after test): ${await prisma.eventLog.count()}`);
  } finally {
    // Restore the original assessment.completed endpoint (never leave the test URL).
    if (originalEndpoint) {
      await prisma.webhook.update({
        where: { name: "assessment.completed" },
        data: {
          url: originalEndpoint.url,
          secret: originalEndpoint.secret,
          status: originalEndpoint.status,
        },
      });
    } else {
      await prisma.webhook
        .delete({ where: { name: "assessment.completed" } })
        .catch(() => {});
    }

    if (!KEEP) {
      const subIds = [submissionId, oldSubmissionId].filter(Boolean) as string[];
      if (subIds.length) {
        await prisma.webhookLog.deleteMany({ where: { submissionId: { in: subIds } } });
        await prisma.eventLog.deleteMany({ where: { submissionId: { in: subIds } } });
      }
      if (createdAssessmentId) {
        await prisma.assessment.delete({ where: { id: createdAssessmentId } }).catch(() => {});
      }
      line("\n(cleaned up test data; set VERIFY_KEEP=1 to retain it)");
    } else {
      line("\n(VERIFY_KEEP=1 — test data retained for inspection)");
    }

    server.close();
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error("verify-events failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
