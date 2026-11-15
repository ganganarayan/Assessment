/**
 * qa:ad-ready - the "Ad ready" setup flow, end to end, the way a customer's Claude does it.
 *
 * Everything is done THROUGH THE MCP with a read-write key for the kept QA workspace:
 * import a template, shape the gate (one answer waitlists), write the landing screen,
 * publish, fetch the signed test link. Then a real browser walks the four test paths
 * through that link (turned away, waitlisted, passed the gate and left, completed) plus a
 * retake as the same person, and the MCP reads back what fired, the stats and the
 * readiness check. Real numbers must stay at zero, nothing may reach Meta.
 *
 * 🔴 No Meta. The QA workspace has no ad account, the browser blocks facebook.* (and the
 * test link loads no pixel anyway), and "we don't use Meta" is switched on for the run so
 * the readiness check can pass. It is restored at the end.
 *
 *   QA_ENV_FILE=qa/.env.qa.prod npm run qa:ad-ready -- --i-know-this-is-prod
 *   flags: --keep (leave the funnel and key), --headed
 */
import { chromium, type Browser } from "playwright";
import { createHash, randomBytes } from "node:crypto";
import { loadQaEnv } from "../env.js";
import { closeDb, db, withDbRetry } from "../db.js";
import { readFunnel } from "../config/read.js";
import { generateCases } from "../cases/generate.js";
import { expectationFor } from "../oracle/expect.js";
import { oracleContext } from "../oracle/context.js";
import { newRunId } from "../drive/identity.js";
import { driveCase, newCaseContext, type DriveOptions, type Observation } from "../drive/run.js";
import { META_URL_PARAMETERS } from "../../../src/lib/meta/url-parameters.js";

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(`--${f}`);

type Json = Record<string, unknown>;
interface Check {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}
const checks: Check[] = [];
const t0 = Date.now();
let lap = Date.now();
function check(name: string, ok: boolean, detail = ""): boolean {
  const now = Date.now();
  checks.push({ name, ok, detail, ms: now - lap });
  lap = now;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  return ok;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- MCP over HTTP ------------------------------------------------------- */

let rpcId = 0;
async function rpc(base: string, key: string, method: string, params: Json = {}): Promise<Json> {
  const res = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  const body = JSON.parse(text.startsWith("event:") || text.startsWith("data:") ? text.split("data:").pop()!.trim() : text) as Json;
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result as Json;
}

/** Call a tool and parse its JSON text. Throws on a tool error, with the message. */
async function tool(base: string, key: string, name: string, args: Json = {}): Promise<Json> {
  const r = await rpc(base, key, "tools/call", { name, arguments: args });
  const content = (r.content as { type: string; text: string }[] | undefined) ?? [];
  const text = content.map((c) => c.text).join("\n");
  if (r.isError) throw new Error(`${name}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { text };
  }
}

/** A write the way Claude does it: preview, then confirm with the preview_token. */
async function write(base: string, key: string, name: string, args: Json): Promise<Json> {
  const preview = await tool(base, key, name, args);
  const token = preview.preview_token as string | undefined;
  if (!token) throw new Error(`${name}: the preview returned no preview_token: ${JSON.stringify(preview).slice(0, 300)}`);
  return tool(base, key, name, { ...args, confirm: true, preview_token: token });
}

/** The tool wraps the action's own ActionResult as result.result. */
function unwrap(r: Json): { ok?: boolean; data?: Json; error?: string } {
  const outer = (r.result ?? r) as Json;
  return ((outer.result ?? outer) as { ok?: boolean; data?: Json; error?: string });
}

/** run_app_action's result is the action's ActionResult; unwrap data or throw its error. */
async function act(base: string, key: string, action: string, args: unknown[]): Promise<Json> {
  const r = await write(base, key, "run_app_action", { action, args });
  const res = unwrap(r);
  if (res.ok === false) throw new Error(`${action}: ${res.error}`);
  if (process.env.QA_DEBUG) console.log(`    ${action} -> ${JSON.stringify(r).slice(0, 400)}`);
  return (res.data ?? res) as Json;
}
async function read(base: string, key: string, action: string, args: unknown[]): Promise<Json> {
  const r = await tool(base, key, "run_app_action_read", { action, args });
  const res = unwrap(r);
  if (res.ok === false) throw new Error(`${action}: ${res.error}`);
  return (res.data ?? res) as Json;
}

/* ---------- main ---------------------------------------------------------------- */

async function main(): Promise<number> {
  const env = loadQaEnv();
  console.log(`\nqa:ad-ready on ${env.baseUrl}`);
  if (env.looksLikeProd && !has("i-know-this-is-prod")) {
    console.log("Refusing: that host looks like production. Add -- --i-know-this-is-prod.");
    return 1;
  }
  const tenantId = env.fixtureTenantId;
  if (!tenantId || !env.signupEmail) {
    console.log("Needs QA_FIXTURE_TENANT and QA_SIGNUP_EMAIL (the kept QA workspace and its owner login) in the env file.");
    return 1;
  }
  const prisma = db();
  const owner = await withDbRetry(() => prisma.user.findFirst({ where: { email: env.signupEmail, tenantId }, select: { id: true } }), "the owner login");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  if (!owner || !tenant) {
    console.log("The kept QA workspace or its owner login was not found.");
    return 1;
  }
  if (!/qa/i.test(tenant.name)) {
    console.log(`Refusing: workspace "${tenant.name}" does not look like a QA workspace.`);
    return 1;
  }
  const adAccounts = await prisma.adAccount.count({ where: { tenantId, OR: [{ capiTokenEnc: { not: null } }, { pixelId: { not: null } }] } });
  if (adAccounts > 0) {
    console.log("Refusing: the QA workspace has an ad account with a pixel or token. This run must never reach Meta.");
    return 1;
  }

  const runId = newRunId();
  // Mint a read-write MCP key for the run, the way /w/api does (hash stored, plaintext once).
  const plaintext = `mcp_qa${runId.slice(-4)}_${randomBytes(24).toString("base64url")}`;
  const prefix = plaintext.split("_").slice(0, 2).join("_");
  const keyRow = await prisma.apiToken.create({
    data: { tokenHash: createHash("sha256").update(plaintext).digest("hex"), prefix, scope: "mcp_write", label: `qa ad-ready ${runId}`, createdById: owner.id, tenantId },
    select: { id: true },
  });
  // The Claude connection is behind a release switch (held from customers) and refused on
  // a trial. The QA workspace is made INTERNAL (unlimited) for the run so the flow itself
  // can be proven, and put back afterwards. The two gates are reported, not bypassed.
  const tenantBefore = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { unlimited: true } });
  await prisma.tenant.update({ where: { id: tenantId }, data: { unlimited: true }, select: { id: true } });
  const settingBefore = await prisma.appSetting.findFirst({ where: { tenantId }, select: { id: true, metaNotUsed: true } });
  // No settings row yet: make one for the run, and remove it again at the end.
  const settingRow = settingBefore
    ? await prisma.appSetting.update({ where: { id: settingBefore.id }, data: { metaNotUsed: true }, select: { id: true } })
    : await prisma.appSetting.create({ data: { id: `tenant_${tenantId}`, tenantId, metaNotUsed: true }, select: { id: true } });

  const base = env.baseUrl;
  const key = plaintext;
  let assessmentId = "";
  let browser: Browser | null = null;
  try {
    console.log("\n1. Connect");
    await rpc(base, key, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "qa-ad-ready", version: "1" } });
    const status = await tool(base, key, "connection_status");
    const k = status.key as Json;
    check("connection_status: the key can write", k?.can_write === true, String(k?.access));
    check("connection_status: lands in the QA workspace", (status.workspace as Json)?.id === tenantId);
    const tools = ((await rpc(base, key, "tools/list")).tools as { name: string }[]).map((t) => t.name);
    check("write tools are listed for a read-write key", tools.includes("run_app_action") && tools.includes("describe_app_action"));
    const prompts = ((await rpc(base, key, "prompts/list")).prompts as { name: string }[]).map((p) => p.name);
    check("the ad_ready_setup prompt is offered", prompts.includes("ad_ready_setup"));
    const prompt = await rpc(base, key, "prompts/get", { name: "ad_ready_setup" });
    const promptText = JSON.stringify(prompt);
    check(
      "the playbook names the test link, run log, readiness check and URL parameters",
      ["getTestLink", "listRunEvents", "adReadiness", "saveTestEventCode", "utm_content={{ad.id}}"].every((s) => promptText.includes(s)),
    );

    console.log("\n2. Set up through the MCP");
    const templates = await tool(base, key, "list_templates");
    const list = ((templates.templates ?? templates.items ?? []) as { id: string; title?: string; name?: string }[]).filter(Boolean);
    // A template whose gate has at least two turn-away answers, so one can become the waitlist.
    let chosen: { id: string; title: string } | null = null;
    for (const t of list) {
      const row = await prisma.template.findUnique({ where: { id: t.id }, select: { body: true } });
      const b = row?.body as Json | null;
      const q = (b?.qualification ?? (b?.assessment as Json | undefined)?.qualification) as Json | undefined;
      const options = ((q?.questions as Json[] | undefined) ?? []).flatMap((x) => ((x.options as Json[] | undefined) ?? []));
      if (q?.enabled && options.filter((o) => o.disqualifies).length >= 2) {
        chosen = { id: t.id, title: String(t.title ?? t.name ?? t.id) };
        break;
      }
    }
    if (!check("list_templates offers a template with a real gate", !!chosen, chosen?.title ?? `${list.length} templates listed`)) return 1;
    const imported = await act(base, key, "templates.library.importTemplate", [chosen!.id]);
    assessmentId = String(imported.assessmentId ?? "");
    const slug = String(imported.slug ?? "");
    check("importTemplate created a funnel", !!assessmentId && !!slug, slug);

    // The gate: the second turn-away answer becomes the waitlist, and both exits exist.
    const a = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { qualification: true } });
    const qual = JSON.parse(JSON.stringify(a?.qualification ?? {})) as { questions: { options: { disqualifies: boolean; exitKey?: string }[] }[] };
    const dq = qual.questions.flatMap((q) => q.options).filter((o) => o.disqualifies);
    dq[1]!.exitKey = "waitlist";
    await act(base, key, "assessment.qualification.ensureWaitlistExit", [assessmentId]);
    await act(base, key, "assessment.qualification.saveQualification", [assessmentId, qual]);
    const saved = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { qualification: true, title: true, subheadline: true, startButtonLabel: true } });
    check("saveQualification stored the waitlist answer", JSON.stringify(saved?.qualification).includes('"exitKey":"waitlist"'));

    const headline = `QA ad-ready ${runId}`;
    await act(base, key, "assessment.landing.saveLandingScreen", [assessmentId, { headline, subheadline: "Three minutes, honest answers.", startButtonLabel: "Start the check" }]);
    const landing = await read(base, key, "assessment.landing.getLandingScreen", [assessmentId]);
    check("saveLandingScreen saved, and getLandingScreen reads it back", landing.headline === headline && landing.startButtonLabel === "Start the check");

    // Step 8: a result page, created, bound and published.
    const doc = await act(base, key, "result-pages.docs.createAndBindDoc", [assessmentId, "RESULTS", `QA result ${runId}`]);
    const docId = String(doc.id ?? "");
    await act(base, key, "assessment.pages.publishPages", [docId]);
    const bound = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { resultsDocId: true, resultsDoc: { select: { publishedAt: true } } } });
    check("a result page is created, bound and published", bound?.resultsDocId === docId && !!bound?.resultsDoc?.publishedAt);

    // Step 9: Meta reporting on (a template arrives with it off). Through the MCP action
    // when the server has it; an older server gets the switch from the harness, reported.
    try {
      await act(base, key, "assessment.meta-reporting.setMetaReporting", [assessmentId, true]);
      check("setMetaReporting switched Meta reporting on", true);
    } catch (e) {
      await prisma.assessment.update({ where: { id: assessmentId }, data: { fireMetaCapi: true }, select: { id: true } });
      check("setMetaReporting is on this server (else switched on by the harness)", false, e instanceof Error ? e.message.slice(0, 120) : String(e));
    }

    const before = await read(base, key, "onboarding.adReadiness", [assessmentId]);
    const failingBefore = (before.failing as string[]) ?? [];
    check("adReadiness before publishing: not ready, and says why", before.ready === false && failingBefore.some((f) => f.startsWith("Published")), failingBefore.length + " failing");

    const published = await act(base, key, "assessment.assessment.setAssessmentStatus", [assessmentId, true]);
    const adLink = published.ad_link as { website_url?: string; url_parameters?: string } | undefined;
    check("publishing returns the ad link with the exact URL parameters", adLink?.url_parameters === META_URL_PARAMETERS && !!adLink?.website_url?.endsWith(`/a/${slug}`), adLink?.website_url);

    const link = await read(base, key, "assessment.test-runs.getTestLink", [assessmentId]);
    const testUrl = String(link.url ?? "");
    check("getTestLink returns a signed test link", /\/a\/[^/]+\/test\/[\w-]+\.[\w-]+$/.test(testUrl), testUrl.replace(/\/test\/.*/, "/test/..."));
    const bad = await fetch(`${base}/a/${slug}/test/forged.token`, { redirect: "manual" });
    check("a forged test link is refused, never the live funnel", bad.status === 410, String(bad.status));

    console.log("\n3. Test runs through the test link");
    const funnel = await readFunnel(slug);
    const ctx = await oracleContext(funnel);
    const cases = generateCases(funnel).filter((c) => !c.unreachable).map((c) => ({ plan: c.plan, e: expectationFor(funnel, c.plan, ctx) }));
    const pick = {
      turnedAway: cases.find((c) => c.e.gate?.outcome === "exit" && c.e.gate.turnedAway && c.e.gate.exitKey !== "waitlist"),
      waitlisted: cases.find((c) => c.e.gate?.exitKey === "waitlist"),
      passedAndLeft: cases.find((c) => c.plan.behaviours.includes("abandon-at-optin")),
      completed: cases.find((c) => c.plan.behaviours.length === 0 && c.e.gate?.outcome === "pass" && !c.e.abandonsAtOptin && c.e.terminal),
    };
    const opts: DriveOptions = { baseUrl: base, headed: has("headed"), slowMo: 0, desktop: false, trace: false, runId, entryUrl: testUrl };
    browser = await chromium.launch({ headless: !opts.headed });
    const observed: Record<string, Observation> = {};
    for (const [path, c] of Object.entries(pick)) {
      if (!check(`a case exists for "${path}"`, !!c, c?.plan.title)) continue;
      const context = await newCaseContext(browser, opts);
      observed[path] = await driveCase(context, funnel, c!.plan, opts);
      if (path === "completed") {
        // Same person again: the retake lock must not stop an owner's test run.
        const again = await driveCase(context, funnel, c!.plan, opts);
        check("a retake as the same person is not locked out on the test link", !again.steps.includes("locked") && !again.steps.includes("capLocked"), again.steps.slice(-2).join(" > "));
      }
      await context.close();
      const o = observed[path]!;
      check(`run "${path}" walked`, !o.crashed && o.consoleErrors.length === 0, `${o.steps.slice(-2).join(" > ")}${o.consoleErrors.length ? `; ${o.consoleErrors[0]}` : ""}`);
      check(`run "${path}" loaded no Meta pixel`, o.pixelEvents.length === 0, o.pixelEvents.join(","));
    }
    await sleep(4000); // beacons land

    console.log("\n4. Read back");
    const rows = await prisma.$transaction([
      prisma.pageView.count({ where: { assessmentId, isPreview: false } }),
      prisma.gateEntry.count({ where: { assessmentId, isPreview: false } }),
      prisma.gateDisqualification.count({ where: { assessmentId, isPreview: false } }),
      prisma.submission.count({ where: { assessmentId, isPreview: false } }),
      prisma.runEvent.count({ where: { assessmentId, isPreview: false } }),
    ]);
    check("no real rows: every visit, gate pass, rejection, submission and event is flagged as a test", rows.every((n) => n === 0), rows.join("/"));
    const sent = await prisma.runEvent.count({ where: { assessmentId, status: { in: ["sent", "fired", "test_sent"] } } });
    check("nothing reached Meta (no sent, fired or test_sent event)", sent === 0, String(sent));

    const log = await read(base, key, "events.log.listRunEvents", [assessmentId, 60, true]);
    const runs = (log.runs as { test_run: boolean; path: string[]; events: { side: string; status: string; dedup: string }[] }[]) ?? [];
    check("listRunEvents shows the runs, all flagged as tests", runs.length >= 3 && runs.every((r) => r.test_run), `${runs.length} runs`);
    const pixel = runs.flatMap((r) => r.events).filter((e) => e.side === "browser");
    check("browser events are logged as would have fired", pixel.length > 0 && pixel.every((e) => e.status === "would_fire"), `${pixel.length} browser events`);
    check("browser and server share an event id for at least one event", runs.flatMap((r) => r.events).some((e) => e.dedup.startsWith("server sent the same") || e.dedup.startsWith("browser reported the same")));
    check("a run shows its path (completed)", runs.some((r) => r.path.some((p) => p.startsWith("completed"))));

    const stats = await tool(base, key, "get_funnel_stats", { assessment_id: assessmentId });
    const g = (x: unknown, k: string) => (x as Json)?.[k] as number;
    check(
      "real stats stay at zero",
      g(stats.visits, "total") === 0 && g(stats.gate_passed, "real") === 0 && g(stats.disqualified, "turned_away") === 0 && g(stats.opt_ins, "real") === 0 && g(stats.completed, "real") === 0,
      `visits ${g(stats.visits, "total")}, gate ${g(stats.gate_passed, "real")}, turned away ${g(stats.disqualified, "turned_away")}, opt-ins ${g(stats.opt_ins, "real")}, completed ${g(stats.completed, "real")}`,
    );
    check(
      "test runs are counted apart",
      g(stats.disqualified, "test_runs") >= 1 && g(stats.completed, "test_runs") >= 1 && g(stats.gate_passed, "test_runs") >= 1,
      `turned away ${g(stats.disqualified, "test_runs")}, gate ${g(stats.gate_passed, "test_runs")}, completed ${g(stats.completed, "test_runs")}`,
    );

    const after = await read(base, key, "onboarding.adReadiness", [assessmentId]);
    check("adReadiness after the four runs: ready", after.ready === true, ((after.failing as string[]) ?? []).join(" | ").slice(0, 400));
    check("adReadiness hands over the ad link", (after.ad_link as Json)?.url_parameters === META_URL_PARAMETERS);

    console.log("\n5. Clear the test runs");
    const cleared = await act(base, key, "assessment.test-runs.clearTestRuns", [assessmentId]);
    check("clearTestRuns removed the test rows", Number(cleared.submissions) >= 1 && Number(cleared.turned_away) >= 1, JSON.stringify(cleared));
    const statsAfter = await tool(base, key, "get_funnel_stats", { assessment_id: assessmentId });
    check("after clearing, test counts are back to zero", g(statsAfter.completed, "test_runs") === 0 && g(statsAfter.disqualified, "test_runs") === 0);
  } catch (e) {
    check("the run finished without an error", false, e instanceof Error ? e.message.slice(0, 500) : String(e));
  } finally {
    await browser?.close().catch(() => {});
    if (!has("keep")) {
      if (assessmentId) {
        try {
          await act(base, key, "assessment.assessment.deleteAssessment", [assessmentId]);
          console.log("\n  removed the test funnel");
        } catch (e) {
          console.log(`\n  could not remove the funnel ${assessmentId}: ${e instanceof Error ? e.message : e}`);
        }
      }
      await prisma.apiToken.update({ where: { id: keyRow.id }, data: { revokedAt: new Date() }, select: { id: true } }).catch(() => {});
    }
    if (settingBefore) await prisma.appSetting.update({ where: { id: settingBefore.id }, data: { metaNotUsed: settingBefore.metaNotUsed }, select: { id: true } }).catch(() => {});
    else await prisma.appSetting.delete({ where: { id: settingRow.id }, select: { id: true } }).catch(() => {});
    await prisma.tenant.update({ where: { id: tenantId }, data: { unlimited: tenantBefore?.unlimited ?? false }, select: { id: true } }).catch(() => {});
  }

  const failed = checks.filter((c) => !c.ok);
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed in ${Math.floor(secs / 60)} min ${secs % 60} s.`);
  for (const f of failed) console.log(`  FAIL  ${f.name}  ${f.detail}`);
  return failed.length ? 1 : 0;
}

main()
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });
