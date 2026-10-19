/**
 * The zone check: WHICH APP answers each host in divineleads.guru.
 *
 * 🔴 WHY THIS EXISTS. On 2026-10-14 four live apps - avr, cosmetic, powertools and
 * paymentz - served the Assess360 marketing page for about four hours. The Cloudflare
 * Worker that fronts Cloudflare for SaaS holds a `*\/*` route on the zone (it has to:
 * client hostnames are not known in advance), and the DEPLOYED script had no zone
 * pass-through, so it rewrote every host in the zone to Assess360's origin.
 *
 * The session that set it up recorded "verified: all five return 200". That was true and
 * useless. A REWRITTEN REQUEST RETURNS A HEALTHY 200 FROM THE WRONG APP - the status code
 * cannot see the failure, and neither can an uptime monitor. The only check that works is
 * identity: does the app answering this host claim to be the app that owns it.
 *
 * The second half of the trap: `infra/cloudflare-worker.js` IS NOT THE DEPLOYED ARTIFACT.
 * It WAS pasted into the Cloudflare dashboard by hand, so committing a Worker fix changed
 * nothing live, and the variables had been set correctly for hours while the script
 * ignored them. That half is now fixed: the Worker deploys from the repo with
 * `npm run worker:deploy` (infra/wrangler.toml), so the artifact and the file agree.
 *
 * This check is still the one that matters, because the remaining failure modes do not
 * show up in a diff: a deploy that did not reach the edge, a second Worker holding the
 * same *\/* route, or a DNS record newly proxied into a route nobody re-tested. RUN THIS
 * AFTER EVERY WORKER DEPLOY, not after every commit.
 *
 *   npm run verify:zone
 *
 * Read-only, no credentials, hits the public internet only.
 */

/** The zone the SaaS Worker's route covers. */
const ZONE = "divineleads.guru";

/** Hosts Assess360 IS supposed to answer. */
const OURS = ["assess360"];

/**
 * Hosts in the zone that belong to OTHER apps. Assess360 answering any of these is the
 * 2026-10-14 outage, live again.
 *
 * 🔴 ADD A HOST HERE WHEN A NEW APP JOINS THE ZONE. A host nobody listed is a host this
 * check cannot protect, and the `*\/*` route covers it from the moment its DNS record is
 * proxied.
 */
const FOREIGN = ["avr", "cosmetic", "powertools", "paymentz"];

/**
 * The Cloudflare for SaaS fallback origin. It is INSIDE the zone, so the Worker must pass
 * it through to Railway - which does not route that bare host, so 404 is the healthy
 * answer and the Assess360 page is the symptom. Client hostnames reach Railway through
 * this origin with their own Host header, which is a different request entirely.
 */
const FALLBACK = "customhost";

/** How long any one request may take before it counts as unreachable. */
const TIMEOUT_MS = 15_000;

interface Probe {
  host: string;
  /** Status of GET /, or null when the host could not be reached at all. */
  status: number | null;
  title: string | null;
  /**
   * What GET /api/version returned. "assess" means the Assess360 shape ({commit, branch,
   * deploymentId}); every other app in the zone either 404s or answers with its own
   * shape, which is exactly what makes this a fingerprint.
   */
  version: "assess" | "other" | "none";
  error: string | null;
}

/** The whole host, as the Worker sees it. */
const fqdn = (label: string): string => `${label}.${ZONE}`;

async function get(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
    headers: { "user-agent": "assess360-verify-zone" },
  });
  return { status: res.status, body: await res.text() };
}

/** One retry, because a single dropped connection is not evidence of a misrouted host. */
async function getWithRetry(url: string): Promise<{ status: number; body: string }> {
  try {
    return await get(url);
  } catch {
    return await get(url);
  }
}

function titleOf(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const t = m?.[1]?.trim();
  return t ? t : null;
}

/**
 * Is this the Assess360 version payload? Keyed on the two fields only Assess360 emits
 * together. Deliberately not a substring match on the body: paymentz serves its SPA shell
 * for unknown paths, so "did /api/version return 200" proves nothing.
 */
function isAssessVersion(body: string): boolean {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return false;
    const o = parsed as Record<string, unknown>;
    return typeof o.commit === "string" && typeof o.deploymentId === "string";
  } catch {
    return false;
  }
}

async function probe(label: string): Promise<Probe> {
  const host = fqdn(label);
  try {
    const root = await getWithRetry(`https://${host}/`);
    let version: Probe["version"] = "none";
    try {
      const v = await getWithRetry(`https://${host}/api/version`);
      version = v.status === 200 ? (isAssessVersion(v.body) ? "assess" : "other") : "none";
    } catch {
      version = "none";
    }
    return { host, status: root.status, title: titleOf(root.body), version, error: null };
  } catch (e) {
    return {
      host,
      status: null,
      title: null,
      version: "none",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Is Assess360 answering? The version endpoint is the primary signal; the title is the
 * fallback for a deployment too old to carry it, and matches the platform marketing page
 * that a rewritten request lands on.
 */
function servedByAssess(p: Probe): boolean {
  return p.version === "assess" || (p.title?.includes("Assess360") ?? false);
}

const describe = (p: Probe): string =>
  p.error
    ? `unreachable (${p.error})`
    : `${p.status} ${p.title ? `"${p.title}"` : "(no title)"}${p.version === "assess" ? " [assess version]" : ""}`;

async function main(): Promise<void> {
  const failures: string[] = [];
  const labels = [...OURS, ...FOREIGN, FALLBACK];

  console.log(`zone ${ZONE}: probing ${labels.length} hosts\n`);
  const probes = await Promise.all(labels.map(probe));
  const byLabel = new Map(labels.map((l, i) => [l, probes[i]]));

  for (const label of labels) {
    const p = byLabel.get(label);
    if (!p) continue;
    console.log(`  ${p.host.padEnd(34)} ${describe(p)}`);
  }
  console.log();

  for (const label of OURS) {
    const p = byLabel.get(label);
    if (!p) continue;
    if (p.error) {
      failures.push(`${p.host} is unreachable: ${p.error}`);
    } else if (!servedByAssess(p)) {
      failures.push(`${p.host} should be Assess360 and is not - got ${describe(p)}`);
    }
  }

  for (const label of FOREIGN) {
    const p = byLabel.get(label);
    if (!p) continue;
    if (p.error) {
      failures.push(`${p.host} is unreachable: ${p.error}`);
    } else if (servedByAssess(p)) {
      failures.push(
        `${p.host} is being served by ASSESS360 - the Worker is rewriting own-zone traffic. ` +
          `Run \`npm run worker:deploy\` to ship infra/cloudflare-worker.js from the repo ` +
          `(ZONE_HOST comes from infra/wrangler.toml, so a stale dashboard variable can no ` +
          `longer be the cause), then check no second Worker holds the */* route. ` +
          `\`npm run worker:rollback\` reverts if the deploy itself is what broke it.`,
      );
    }
  }

  const fb = byLabel.get(FALLBACK);
  if (fb) {
    if (fb.error) {
      failures.push(`${fb.host} is unreachable: ${fb.error}`);
    } else if (servedByAssess(fb)) {
      failures.push(
        `${fb.host} is the SaaS fallback origin and must PASS THROUGH to Railway, which ` +
          `does not route the bare host - 404 is healthy. Assess360 answering it means the ` +
          `Worker is rewriting own-zone traffic.`,
      );
    } else if (fb.status !== 404) {
      console.log(`note: ${fb.host} answered ${fb.status}, not the expected 404. Not a failure - it is not Assess360 - but worth a look.\n`);
    }
  }

  if (failures.length > 0) {
    console.error(`${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`zone OK: every host is served by the app that owns it`);
}

void main();
