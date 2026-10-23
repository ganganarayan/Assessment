/**
 * How long have the last N builds actually taken, and where did the time go?
 *
 * 🔴 WHY THIS EXISTS. "The build got slower" has two possible causes and they look
 * identical from the outside: the repository grew, or the builder did less work per
 * minute. Guessing between them is how a team spends a week optimising a build that
 * was never the problem. This prints the series, so the question is answered by the
 * shape of the numbers rather than by an opinion about them.
 *
 * READ IT LIKE THIS. Build duration against COMMIT DATE is the whole diagnostic:
 *
 *   - Durations that climb gradually, commit after commit, are the codebase. More
 *     source is more to typecheck, lint and compile, and it arrives a little at a
 *     time.
 *   - Durations that are flat and then STEP, with no matching jump in what the
 *     commits contain, are the builder. Code does not get 3x slower overnight.
 *   - The decisive case is the same commit built twice, far apart. Identical input,
 *     different duration, and nothing in the repository can explain it. The script
 *     flags those pairs itself, under "the same commit, built twice".
 *
 * Run it with a Railway token in the environment. The token never leaves your machine
 * and is never printed:
 *
 *   RAILWAY_API_TOKEN=... RAILWAY_PROJECT_ID=... RAILWAY_ENVIRONMENT_ID=... \
 *   RAILWAY_SERVICE_ID=... npx tsx scripts/railway-build-times.ts [count]
 *
 * All four values are on the service's Variables tab, which is where the app already
 * reads them from for custom domains.
 */

// Makes this file a MODULE rather than a script sharing one global scope with every
// other file in scripts/. Without it, TIMEOUT_MS here and TIMEOUT_MS in verify-zone.ts
// are the same declaration twice and the whole typecheck fails.
export {};

const ENDPOINT = "https://backboard.railway.com/graphql/v2";
const TIMEOUT_MS = 20_000;

const token = process.env.RAILWAY_API_TOKEN;
const projectId = process.env.RAILWAY_PROJECT_ID;
const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
const serviceId = process.env.RAILWAY_SERVICE_ID;

if (!token || !projectId || !environmentId || !serviceId) {
  console.error(
    "Missing Railway settings. Needs RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID,\n" +
      "RAILWAY_ENVIRONMENT_ID and RAILWAY_SERVICE_ID in the environment.\n" +
      "All four are on the service's Variables tab.",
  );
  process.exit(1);
}

const COUNT = Math.min(Math.max(Number(process.argv[2] ?? 30) || 30, 5), 100);

interface Deployment {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  meta: { commitHash?: string | null; commitMessage?: string | null } | null;
}

const QUERY = `
  query Deployments($projectId: String!, $environmentId: String!, $serviceId: String!, $first: Int!) {
    deployments(
      first: $first
      input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId }
    ) {
      edges { node { id status createdAt updatedAt meta } }
    }
  }
`;

/** DD-MM-YYYY HH:MM in IST, from a fixed offset. The host runs in whatever zone it
 *  likes and the server runs UTC; neither is the zone these timestamps are read in. */
function istStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

const mins = (ms: number) => `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;

async function main(): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { projectId, environmentId, serviceId, first: COUNT },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: { data?: { deployments?: { edges?: { node: Deployment }[] } }; errors?: { message: string }[] };
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`Railway returned non-JSON (status ${res.status}).`);
    process.exit(1);
  }
  if (json.errors?.length) {
    console.error(`Railway API: ${json.errors.map((e) => e.message).join("; ")}`);
    process.exit(1);
  }

  const rows = (json.data?.deployments?.edges ?? []).map((e) => e.node);
  if (rows.length === 0) {
    console.log("No deployments came back. Check the project, environment and service ids.");
    return;
  }

  console.log(`\nLast ${rows.length} deployments, newest first. Times are IST.\n`);
  console.log("  STARTED            DURATION    STATUS      COMMIT    MESSAGE");
  console.log("  " + "-".repeat(94));

  const byCommit = new Map<string, number[]>();
  const durations: number[] = [];

  for (const d of rows) {
    const ms = new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime();
    const sha = (d.meta?.commitHash ?? "").slice(0, 7) || "-";
    const msg = (d.meta?.commitMessage ?? "").split("\n")[0]?.slice(0, 44) ?? "";
    console.log(
      `  ${istStamp(d.createdAt).padEnd(18)} ${mins(ms).padEnd(11)} ${d.status.padEnd(11)} ${sha.padEnd(9)} ${msg}`,
    );
    // Only SUCCESS rows are comparable. A failure stops early and a cancelled one
    // stops wherever somebody pressed the button, so including them would make the
    // series look faster for the worst possible reason.
    if (d.status === "SUCCESS") {
      durations.push(ms);
      if (sha !== "-") byCommit.set(sha, [...(byCommit.get(sha) ?? []), ms]);
    }
  }

  if (durations.length >= 4) {
    // Newest half against oldest half. Blunt on purpose: the question is whether the
    // recent ones are in a different league, not what the exact trend line is.
    const half = Math.floor(durations.length / 2);
    const recent = durations.slice(0, half);
    const older = durations.slice(half);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    console.log(`\n  Successful builds: ${durations.length}`);
    console.log(`  Newest ${recent.length}: average ${mins(avg(recent))}`);
    console.log(`  Oldest ${older.length}: average ${mins(avg(older))}`);
    const ratio = avg(recent) / avg(older);
    console.log(`  Recent builds are ${ratio.toFixed(2)}x the older ones.`);
  }

  // The decisive evidence, when it exists.
  const repeats = [...byCommit.entries()].filter(([, v]) => v.length > 1);
  if (repeats.length > 0) {
    console.log("\n  The same commit, built twice. Identical input, so any gap here is the builder:");
    for (const [sha, list] of repeats) {
      const sorted = [...list].sort((a, b) => a - b);
      const lo = sorted[0] ?? 0;
      const hi = sorted[sorted.length - 1] ?? 0;
      console.log(`    ${sha}  ${list.length} builds, fastest ${mins(lo)}, slowest ${mins(hi)}`);
    }
  } else {
    console.log(
      "\n  No commit was built twice in this window, so there is no identical-input\n" +
        "  comparison yet. Redeploying any older commit would create one.",
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
