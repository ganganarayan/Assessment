/**
 * Domain doctor - "why doesn't sign-in work on this host?", answered without signing in.
 *
 * READ-ONLY. It changes nothing. Auth trusts a host when Railway ROUTES it to this
 * service (see src/lib/tenant/served-host.ts), so this prints exactly what the app
 * sees: the hosts Railway routes, the registered Domain rows, and the env canonical
 * host. If your domain is missing from the Railway list, point it at the service in
 * Railway - that is the whole fix, and no command is needed to "register" it here.
 *
 *   railway run --environment production npx tsx scripts/domain-doctor.ts
 *   railway run --environment production npx tsx scripts/domain-doctor.ts assess360.divineleads.guru
 */
import "./public-db-url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ENDPOINT = "https://backboard.railway.com/graphql/v2";
const target = (process.argv[2] ?? "").trim().toLowerCase().replace(/\.$/, "");

async function routedHosts(): Promise<string[] | null> {
  const token = process.env.RAILWAY_API_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
  const serviceId = process.env.RAILWAY_SERVICE_ID;
  if (!token || !projectId || !environmentId || !serviceId) return null;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      query: `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
        domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
          customDomains { domain } serviceDomains { domain }
        }
      }`,
      variables: { projectId, environmentId, serviceId },
    }),
  });
  const json = (await res.json()) as {
    data?: { domains?: { customDomains?: { domain: string }[]; serviceDomains?: { domain: string }[] } };
    errors?: { message: string }[];
  };
  if (json.errors?.length) {
    console.error("Railway API:", json.errors.map((e) => e.message).join("; "));
    return null;
  }
  return [...(json.data?.domains?.customDomains ?? []), ...(json.data?.domains?.serviceDomains ?? [])]
    .map((d) => (d?.domain ?? "").toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
}

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).host.toLowerCase() : "";
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const canonical = hostOf(process.env.BETTER_AUTH_URL) || hostOf(process.env.NEXT_PUBLIC_APP_URL);
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase();
  console.log(`Canonical host (env): ${canonical || "(unset)"}`);
  console.log(`Root domain (env):    ${root || "(unset)"}  - this host and *.${root} are always trusted`);

  const routed = await routedHosts();
  if (routed === null) {
    console.log("\nRailway: NOT configured (missing token or injected IDs) - auth falls back to Domain rows + env.");
  } else {
    console.log(`\nRailway routes ${routed.length} host(s) to this service:`);
    for (const h of routed) console.log(`  ${h}`);
  }

  // The DB is the BACKSTOP, not the answer - and running with the app service's env
  // (which is where the Railway token lives) hands us a DATABASE_URL on Railway's
  // INTERNAL host, unreachable from a laptop. A DB failure must not take the Railway
  // verdict down with it, so it is reported and the run continues.
  let rows: { hostname: string; verified: boolean; certStatus: string | null; tenant: { slug: string } }[] = [];
  let dbError: string | null = null;
  try {
    rows = await prisma.domain.findMany({
      select: { hostname: true, verified: true, certStatus: true, tenant: { select: { slug: true } } },
      orderBy: { createdAt: "asc" },
    });
  } catch (e) {
    dbError = (e instanceof Error ? e.message : String(e)).split("\n").find((l) => l.trim()) ?? "unreachable";
  }
  if (dbError) {
    console.log(`\nDomain rows: could not read the database (${dbError.trim()}).`);
    console.log("  Not fatal - Railway's list above is what auth uses. Use --service Postgres to read rows.");
  } else {
    console.log(`\nDomain rows in the database (${rows.length}):`);
    for (const r of rows) {
      console.log(`  ${r.hostname} -> tenant ${r.tenant.slug}  verified=${r.verified}  cert=${r.certStatus ?? "-"}`);
    }
    if (!rows.length) console.log("  (none)");
  }

  if (target) {
    const trusted =
      target === canonical ||
      target === root ||
      target.endsWith(`.${root}`) ||
      (routed?.includes(target) ?? false) ||
      rows.some((r) => r.hostname.toLowerCase() === target);
    console.log(`\n${target}: ${trusted ? "TRUSTED - sign-in and password reset work here." : "NOT trusted - point it at this service in Railway."}`);
  }
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
