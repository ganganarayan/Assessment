/**
 * The part of the funnel that happens ten minutes after everybody has gone home.
 *
 * Leaving the opt-in form does not fire anything: it starts a clock, because this form
 * asks for a WhatsApp number and the most common reason to leave it is to go and fetch
 * that number. Ten minutes later a sweep decides which loss it was - AssessmentAbandoned
 * for somebody who saw the ask and refused it, GateIncomplete for somebody who never got
 * that far - and those are two different retargeting audiences.
 *
 * A browser sweep cannot wait ten minutes per case, so it asserts the clock and leaves
 * the verdict to this command. It runs the app's OWN sweep (the same function the Railway
 * cron runs, imported rather than reimplemented) and then checks that what fired is what
 * the funnel's configuration says should have fired.
 *
 *   railway run npm run qa:abandon -- --slug=<funnel>          settle what is due
 *   railway run npm run qa:abandon -- --slug=<funnel> --wait   wait for the clock first
 *
 * Note it settles EVERY entry that is due on that funnel, not only this harness's -
 * which is exactly what the cron would do anyway, and the output says so.
 */
import { db, closeDb } from "./db.js";
import { loadQaEnv } from "./env.js";
import { readFunnel } from "./config/read.js";
import { preflight, renderGuard } from "./guard.js";
import { readMetaEvents } from "../../src/features/assessment/meta-events.js";
import { ABANDONED_EVENT, GATE_INCOMPLETE_EVENT } from "../../src/features/assessment/schemas.js";

interface Pending {
  id: string;
  visitorId: string;
  optinSeenAt: Date | null;
  abandonDueAt: Date | null;
  passedAt: Date;
  optedIn: boolean;
}

/**
 * The app's env module fails fast on four variables, and `railway run` injects the
 * Postgres service's variables rather than the web service's. The sweep only reads
 * NEXT_PUBLIC_APP_URL (for the event's source url); the rest are placeholders so that
 * importing the module does not refuse for reasons the sweep does not care about.
 */
function fillEnvForAppImport(baseUrl: string, databaseUrl: string): void {
  // The app builds its Prisma client from DATABASE_URL at import time, and under
  // `railway run` that is the internal host, which does not resolve from a laptop. Swap
  // it BEFORE the app module is imported or the sweep cannot reach the database.
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
  process.env.NEXT_PUBLIC_APP_URL ||= baseUrl;
  process.env.BETTER_AUTH_URL ||= baseUrl;
  process.env.BETTER_AUTH_SECRET ||= "qa-harness-placeholder-not-a-secret";
}

async function pendingFor(assessmentId: string): Promise<Pending[]> {
  const rows = await db().gateEntry.findMany({
    where: { assessmentId, abandonedFiredAt: null },
    select: { id: true, visitorId: true, optinSeenAt: true, abandonDueAt: true, passedAt: true },
    orderBy: { passedAt: "desc" },
    take: 200,
  });
  const out: Pending[] = [];
  for (const r of rows) {
    const optedIn = await db().submission.count({
      where: { assessmentId, metaExternalId: r.visitorId },
    });
    out.push({ ...r, optedIn: optedIn > 0 });
  }
  return out;
}

/** What the funnel should report for one pending visitor, by its own rules. */
function owed(p: Pending, fireMetaCapi: boolean, metaEvents: unknown): string | null {
  // Opting in is the whole test: the submission IS the opt-in, and somebody we already
  // hold must never be paid for twice.
  if (p.optedIn) return null;
  const events = readMetaEvents(metaEvents);
  const sawOptin = p.optinSeenAt !== null;
  const name = sawOptin ? ABANDONED_EVENT : GATE_INCOMPLETE_EVENT;
  const on = fireMetaCapi && (sawOptin ? events.abandoned : events.gateIncomplete);
  return on ? name : null;
}

async function eventTotals(assessmentId: string): Promise<Map<string, number>> {
  const rows = await db().funnelEventCount.findMany({
    where: { assessmentId },
    select: { eventName: true, count: true, failed: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.eventName, (out.get(r.eventName) ?? 0) + r.count + r.failed);
  return out;
}

export async function settleAbandonment(args: {
  slug: string;
  wait: boolean;
  forceLive: boolean;
}): Promise<number> {
  const env = loadQaEnv();
  fillEnvForAppImport(env.baseUrl, env.databaseUrl);

  const funnel = await readFunnel(args.slug);
  const guard = await preflight(funnel, {
    allowLiveIntegrations: args.forceLive,
    isProdHost: env.looksLikeProd,
    allowProd: false,
  });
  console.log(`\nTarget: ${env.baseUrl}  funnel: ${args.slug}\n`);
  console.log(renderGuard(guard));
  if (guard.blocked) {
    console.log("\nRefusing to run: one or more blocking findings above.");
    return 1;
  }

  let pending = await pendingFor(funnel.row.id);
  const waiting = pending.filter((p) => p.abandonDueAt && p.abandonDueAt > new Date());
  const due = () => pending.filter((p) => p.abandonDueAt && p.abandonDueAt <= new Date());

  console.log(`\n${pending.length} visitor(s) with no verdict yet: ${due().length} due now, ${waiting.length} still inside the grace period.`);

  if (due().length === 0 && waiting.length > 0) {
    const next = waiting.reduce((min, p) => (p.abandonDueAt! < min ? p.abandonDueAt! : min), waiting[0]!.abandonDueAt!);
    const seconds = Math.max(0, Math.ceil((next.getTime() - Date.now()) / 1000));
    if (!args.wait) {
      console.log(`\nThe first verdict is due in ${Math.ceil(seconds / 60)} minute(s). Pass --wait to sit it out.`);
      return 0;
    }
    console.log(`\nWaiting ${seconds + 5}s for the first verdict to come due…`);
    await new Promise((r) => setTimeout(r, (seconds + 5) * 1000));
    pending = await pendingFor(funnel.row.id);
  }

  const settling = due();
  if (settling.length === 0) {
    console.log("\nNothing is due. Run a sweep with an opt-in walk-away first.");
    return 0;
  }

  // What each one is owed, decided BEFORE the sweep runs, from the funnel's own rules.
  const expected = new Map<string, number>();
  for (const p of settling) {
    const name = owed(p, funnel.row.fireMetaCapi, funnel.row.metaEvents);
    if (name) expected.set(name, (expected.get(name) ?? 0) + 1);
  }

  const before = await eventTotals(funnel.row.id);

  // The app's own sweep, imported rather than reimplemented. react-server condition and
  // the public database url are set by the npm script.
  // Imported through a variable on purpose: a literal specifier would drag the app's
  // whole server graph into THIS folder's typecheck, where the module resolution and
  // the DOM library differ from the app's, and fail for reasons that have nothing to do
  // with the sweep. The shape is asserted instead, and it is one function.
  const appSweep = "../../src/lib/events/abandoned.js";
  const { sweepGateAbandoned } = (await import(appSweep)) as {
    sweepGateAbandoned: () => Promise<{ fired: number; scanned: number }>;
  };
  const result = await sweepGateAbandoned();
  console.log(`\nThe sweep scanned ${result.scanned} and fired ${result.fired}.`);

  const after = await eventTotals(funnel.row.id);
  const delta = new Map<string, number>();
  for (const [name, n] of after) {
    const diff = n - (before.get(name) ?? 0);
    if (diff !== 0) delta.set(name, diff);
  }

  let failures = 0;
  console.log("");
  for (const [name, count] of expected) {
    const got = delta.get(name) ?? 0;
    const ok = got >= count;
    if (!ok) failures++;
    console.log(`${ok ? "🟢" : "🟡"} ${name}: expected at least ${count}, fired ${got}`);
  }
  for (const [name, got] of delta) {
    if (expected.has(name)) continue;
    failures++;
    console.log(`🟡 ${name}: fired ${got} time(s), and nothing owed it`);
  }
  if (expected.size === 0 && delta.size === 0) {
    console.log("🟢 nothing was owed and nothing fired, which is the right answer for an opted-in visitor");
  }

  // The claim stamp is the thing that stops a visitor being reconsidered for ever.
  const stillPending = await pendingFor(funnel.row.id);
  const stuck = stillPending.filter((p) => settling.some((s) => s.id === p.id));
  if (stuck.length > 0) {
    failures++;
    console.log(`🟡 ${stuck.length} visitor(s) were due and still carry no verdict, so the next run would reconsider them`);
  } else {
    console.log("🟢 every visitor that was due now carries a verdict, so none can fire twice");
  }

  return failures > 0 ? 1 : 0;
}

const argv = process.argv.slice(2);
const get = (name: string): string | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
};

const slug = get("slug") ?? "";
if (!slug) {
  console.log("Usage: npm run qa:abandon -- --slug=<funnel-slug> [--wait] [--force-live]");
  process.exit(2);
}

settleAbandonment({ slug, wait: get("wait") !== undefined, forceLive: get("force-live") !== undefined })
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
    await closeDb();
    process.exit(1);
  });
