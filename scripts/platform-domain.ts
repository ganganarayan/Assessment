/**
 * Break-glass domain registration — the way out of the chicken-and-egg.
 *
 * Auth now trusts any host that has a Domain row (see src/lib/tenant/served-host.ts).
 * Which leaves one knot: if the platform is moved to a new hostname and that host has
 * no row, nobody can sign in there to add it. This script writes the row directly,
 * the same break-glass pattern as reset-user-password.
 *
 * LIST every registered domain (answers "is my host registered?" without signing in):
 *   railway run --environment production npx tsx scripts/platform-domain.ts
 *
 * ADD a hostname to the PLATFORM tenant:
 *   railway run --environment production npx tsx scripts/platform-domain.ts assess360.divineleads.guru
 *
 * ADD to a specific tenant instead, by slug:
 *   railway run --environment production npx tsx scripts/platform-domain.ts shop.acme.com --tenant acme
 *
 * It only ever creates or re-points a Domain row. It does not touch DNS, Railway
 * routing or certificates — those are already handled by the Settings screen. A host
 * that routes here but has no row is exactly the case this repairs.
 */
import "./public-db-url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATFORM_TENANT_ID = "platform";

const args = process.argv.slice(2);
const flagIndex = args.findIndex((a) => a === "--tenant");
const tenantSlug = flagIndex >= 0 ? args[flagIndex + 1] : undefined;
const rawHost = args.find((a) => !a.startsWith("--") && a !== tenantSlug);

/** Accept a bare host or a pasted URL; reject anything that isn't a hostname. */
function normalize(input: string): string | null {
  let h = input.trim().toLowerCase();
  if (h.includes("://")) {
    try {
      h = new URL(h).host;
    } catch {
      return null;
    }
  }
  h = h.split("/")[0] ?? "";
  h = (h.split(":")[0] ?? "").replace(/\.$/, "");
  if (!h || !/^[a-z0-9.-]+$/.test(h) || !h.includes(".")) return null;
  return h;
}

async function list(): Promise<void> {
  const rows = await prisma.domain.findMany({
    select: {
      hostname: true,
      verified: true,
      certStatus: true,
      createdAt: true,
      tenant: { select: { slug: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!rows.length) {
    console.log("No domains registered. Nothing will authenticate except the canonical host and *.ROOT_DOMAIN.");
    return;
  }
  console.log(`${rows.length} registered domain(s):`);
  for (const r of rows) {
    console.log(
      `  ${r.hostname}  →  tenant ${r.tenant.slug} (${r.tenant.name})  verified=${r.verified}  cert=${r.certStatus ?? "-"}`,
    );
  }
}

async function main(): Promise<void> {
  if (!rawHost) {
    await list();
    console.log("\nPass a hostname to register one, e.g. ... scripts/platform-domain.ts assess360.example.com");
    return;
  }

  const hostname = normalize(rawHost);
  if (!hostname) {
    console.error(`Not a valid hostname: ${rawHost}`);
    process.exit(1);
  }

  // Resolve the owning tenant: the named slug, else the platform tenant.
  const tenant = tenantSlug
    ? await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } })
    : await prisma.tenant.findUnique({ where: { id: PLATFORM_TENANT_ID }, select: { id: true, slug: true } });
  if (!tenant) {
    console.error(
      tenantSlug
        ? `No tenant with slug "${tenantSlug}".`
        : `No platform tenant (id "${PLATFORM_TENANT_ID}"). Pass --tenant <slug> to pick one.`,
    );
    await list();
    process.exit(1);
  }

  const existing = await prisma.domain.findUnique({
    where: { hostname },
    select: { id: true, tenantId: true, tenant: { select: { slug: true } } },
  });

  if (existing && existing.tenantId === tenant.id) {
    console.log(`${hostname} is already registered to tenant ${tenant.slug}. Nothing to do — sign-in should work.`);
    return;
  }
  if (existing) {
    // The hostname column is globally unique: one tenant holding it blocks everyone
    // else. Re-point rather than fail, and say so loudly — this is a real change.
    await prisma.domain.update({ where: { hostname }, data: { tenantId: tenant.id } });
    console.log(`${hostname} was registered to tenant ${existing.tenant.slug}; MOVED to ${tenant.slug}.`);
    return;
  }

  await prisma.domain.create({
    data: {
      hostname,
      tenantId: tenant.id,
      // verified reflects the TLS cert, which Railway owns. Leaving it false does not
      // block authentication (isServedHost ignores the flag on purpose); the Settings
      // screen's "Check status" sets it once the cert is live.
      verified: false,
      certStatus: "pending",
    },
  });
  console.log(`Registered ${hostname} to tenant ${tenant.slug}. Sign-in on that host will work within ~60s (cache TTL).`);
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
