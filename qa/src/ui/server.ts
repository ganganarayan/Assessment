/**
 * The control panel: the harness with buttons on it.
 *
 * A local page rather than a desktop window, for one reason that matters - this thing
 * already knows how to list your funnels, read a sweep's tally and find the last
 * report, and a page served by the harness can ask it directly. A Tkinter or WinForms
 * launcher would have to shell out and parse text to learn the same things, and you
 * would be keeping two toolchains for one tool.
 *
 *   railway run npm run qa:ui
 *
 * It serves on localhost only, runs nothing it was not asked to, and every button maps
 * to a command you can type yourself - the page shows each one, so the terminal stays
 * available and nothing here is a black box.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { loadQaEnv, QA_ROOT, REPO_ROOT } from "../env.js";
import { db, closeDb } from "../db.js";
import { page } from "./page.js";

const PORT = Number(process.env.QA_UI_PORT ?? 5175);

/* ---------- what a button may run ----------------------------------------------- */

/**
 * Every runnable thing, named. A whitelist rather than a command string from the page:
 * the panel is local, but a server that runs whatever it is sent is a server that runs
 * whatever anything else on the machine sends it.
 */
interface Job {
  /** What the terminal equivalent is, shown on the button's row. */
  shown: (slug: string) => string;
  args: (slug: string) => string[];
  /** Node flags that have to come before the script. */
  nodeArgs?: string[];
  /** Headed runs raise the browser above other windows while they drive. */
  topmost?: boolean;
  needsSlug?: boolean;
}

const JOBS: Record<string, Job> = {
  setup: {
    shown: () => "npx playwright install chromium",
    args: () => [join(QA_ROOT, "node_modules", "playwright", "cli.js"), "install", "chromium"],
  },
  seed: {
    shown: () => "npm run qa:seed",
    args: () => [join(QA_ROOT, "src", "fixtures", "cli.ts")],
  },
  unseed: {
    shown: () => "npm run qa:seed -- --rm",
    args: () => [join(QA_ROOT, "src", "fixtures", "cli.ts"), "--rm"],
  },
  audit: {
    shown: (s) => `npm run qa -- --slug=${s} --audit`,
    args: (s) => [join(QA_ROOT, "src", "cli.ts"), `--slug=${s}`, "--audit"],
    needsSlug: true,
  },
  plan: {
    shown: (s) => `npm run qa -- --slug=${s} --plan`,
    args: (s) => [join(QA_ROOT, "src", "cli.ts"), `--slug=${s}`, "--plan"],
    needsSlug: true,
  },
  run: {
    shown: (s) => `npm run qa -- --slug=${s}`,
    args: (s) => [join(QA_ROOT, "src", "cli.ts"), `--slug=${s}`],
    needsSlug: true,
  },
  watch: {
    shown: (s) => `npm run qa -- --slug=${s} --headed --slow=250`,
    args: (s) => [join(QA_ROOT, "src", "cli.ts"), `--slug=${s}`, "--headed", "--slow=250"],
    topmost: true,
    needsSlug: true,
  },
  all: {
    shown: () => "npm run qa:all",
    args: () => [join(QA_ROOT, "src", "all.ts")],
  },
  abandon: {
    shown: (s) => `npm run qa:abandon -- --slug=${s}`,
    args: (s) => [join(QA_ROOT, "src", "abandon.ts"), `--slug=${s}`],
    nodeArgs: ["--conditions=react-server"],
    needsSlug: true,
  },
  cleanup: {
    shown: (s) => `npm run qa -- --slug=${s} --cleanup`,
    args: (s) => [join(QA_ROOT, "src", "cli.ts"), `--slug=${s}`, "--cleanup"],
    needsSlug: true,
  },
};

/* ---------- the run in flight ---------------------------------------------------- */

let running: { job: string; child: ChildProcess; startedAt: number } | null = null;

function reportsDir(): string {
  return join(QA_ROOT, "reports");
}

/** The newest report folder, which is what "open the report" means. */
function latestReport(): string | null {
  const dir = reportsDir();
  if (!existsSync(dir)) return null;
  const dirs = readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, "index.html")))
    .sort()
    .reverse();
  return dirs[0] ?? null;
}

/** The tally a sweep wrote beside its report, for the toast and the status line. */
function latestTally(): { pass: number; fail: number; warn: number; skip: number; slug: string } | null {
  const newest = latestReport();
  if (!newest) return null;
  const path = join(reportsDir(), newest, "result.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ReturnType<typeof latestTally> & object;
  } catch {
    return null;
  }
}

/**
 * A Windows toast, through PowerShell, because this is a platform call and a tray
 * balloon costs nothing to send and needs nothing installed. Failure is silent: a
 * missing notification must never be the reason a run looks broken.
 */
function toast(title: string, body: string): void {
  if (process.platform !== "win32") return;
  const script = join(QA_ROOT, "scripts", "notify.ps1");
  if (!existsSync(script)) return;
  spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Title", title, "-Body", body], {
    stdio: "ignore",
    detached: true,
  }).unref();
}

/* ---------- the server ----------------------------------------------------------- */

async function funnels(): Promise<{ slug: string; title: string }[]> {
  try {
    const rows = await db().assessment.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, title: true },
      orderBy: { slug: "asc" },
    });
    return rows;
  } catch {
    return [];
  }
}

function send(res: ServerResponse, code: number, type: string, body: string | Buffer): void {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".zip": "application/zip",
};

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const env = loadQaEnv();

  if (url.pathname === "/") {
    send(res, 200, "text/html; charset=utf-8", page());
    return;
  }

  if (url.pathname === "/api/state") {
    const newest = latestReport();
    send(
      res,
      200,
      "application/json",
      JSON.stringify({
        baseUrl: env.baseUrl,
        looksLikeProd: env.looksLikeProd,
        hasDatabase: Boolean(env.databaseUrl),
        browserReady: existsSync(join(QA_ROOT, "node_modules", "playwright")),
        funnels: await funnels(),
        report: newest ? `/report/${encodeURIComponent(newest)}/index.html` : null,
        tally: latestTally(),
        running: running?.job ?? null,
        commands: Object.fromEntries(Object.entries(JOBS).map(([k, j]) => [k, j.shown("<funnel>")])),
      }),
    );
    return;
  }

  // The report and its screenshots, served from the reports folder and nowhere else.
  if (url.pathname.startsWith("/report/")) {
    const wanted = resolve(reportsDir(), decodeURIComponent(url.pathname.slice("/report/".length)));
    if (!wanted.startsWith(resolve(reportsDir())) || !existsSync(wanted) || statSync(wanted).isDirectory()) {
      send(res, 404, "text/plain", "no such report");
      return;
    }
    send(res, 200, MIME[extname(wanted)] ?? "application/octet-stream", readFileSync(wanted));
    return;
  }

  if (url.pathname === "/api/stop") {
    if (running) {
      running.child.kill();
      running = null;
    }
    send(res, 200, "application/json", JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === "/api/run") {
    const name = url.searchParams.get("job") ?? "";
    const slug = (url.searchParams.get("slug") ?? "").trim();
    const job = JOBS[name];
    if (!job) {
      send(res, 400, "text/plain", "no such job");
      return;
    }
    if (job.needsSlug && !slug) {
      send(res, 400, "text/plain", "that one needs a funnel");
      return;
    }
    if (running) {
      send(res, 409, "text/plain", "something is already running");
      return;
    }
    if (env.looksLikeProd) {
      send(res, 403, "text/plain", "the target is not staging - the panel will not drive it");
      return;
    }

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const line = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const child = spawn(process.execPath, [...(job.nodeArgs ?? []), "--import", "tsx", ...job.args(slug)], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...(job.topmost ? { QA_TOPMOST: "1" } : {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    running = { job: name, child, startedAt: Date.now() };
    line("started", { job: name, command: job.shown(slug) });

    const pipe = (chunk: Buffer) => line("out", chunk.toString());
    child.stdout.on("data", pipe);
    child.stderr.on("data", pipe);

    const startedAt = Date.now();
    child.on("close", (code) => {
      running = null;
      const tally = latestTally();
      const report = latestReport();
      line("done", {
        code,
        seconds: Math.round((Date.now() - startedAt) / 1000),
        tally,
        report: report ? `/report/${encodeURIComponent(report)}/index.html` : null,
      });
      res.end();
      if (name === "run" || name === "all" || name === "watch") {
        const headline = tally
          ? `${tally.pass} passed, ${tally.fail} failed`
          : code === 0
            ? "finished"
            : "stopped early";
        toast(`Funnel check: ${headline}`, tally ? `${tally.slug} - open the panel for the report` : "see the panel");
      }
    });

    req.on("close", () => {
      if (running?.child === child) {
        child.kill();
        running = null;
      }
    });
    return;
  }

  send(res, 404, "text/plain", "not here");
}

/**
 * Listen on BOTH loopback addresses.
 *
 * Bound to 127.0.0.1 alone, the panel answered curl and refused the browser: Windows
 * resolves localhost to ::1 first, so the tab opened, tried IPv6, found nothing
 * listening and sat there forever. Two listeners over one handler keeps it
 * loopback-only - never reachable from the network - while working whichever address
 * the browser picks.
 */
const HOSTS = ["127.0.0.1", "::1"];
let announced = false;

function announce(): void {
  if (announced) return;
  announced = true;
  const env = loadQaEnv();
  console.log(`\nControl panel: http://127.0.0.1:${PORT}   (localhost works too)`);
  console.log(`Target: ${env.baseUrl}${env.looksLikeProd ? "  (NOT staging - runs are blocked)" : ""}`);
  console.log(`Database: ${env.databaseUrl ? "configured" : "MISSING - start this under `railway run`"}`);
  console.log("Leave this running; close it with Ctrl+C.\n");
  if (process.platform === "win32") {
    // 127.0.0.1 rather than localhost: one address, no name resolution, no chance of
    // the browser choosing a family nothing is listening on.
    spawn("cmd", ["/c", "start", "", `http://127.0.0.1:${PORT}`], { stdio: "ignore", detached: true }).unref();
  }
}

const servers = HOSTS.map((host) => {
  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      send(res, 500, "text/plain", err instanceof Error ? err.message : String(err));
    });
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nPort ${PORT} is already in use - a panel is probably open already.`);
      console.error("Close that one, or start this with QA_UI_PORT=5176.\n");
      process.exit(1);
    }
    // A machine with IPv6 switched off simply gets one listener, which is not a failure.
    if (host === "::1") return;
    console.error(`\nCould not listen on ${host}: ${err.message}\n`);
    process.exit(1);
  });
  server.listen(PORT, host, announce);
  return server;
});

process.on("SIGINT", () => {
  running?.child.kill();
  for (const s of servers) s.close();
  void closeDb().finally(() => process.exit(0));
});
