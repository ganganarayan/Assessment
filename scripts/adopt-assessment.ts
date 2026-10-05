/**
 * Adopt ONE unowned assessment (and only its own rows) into a tenant.
 *
 * WHY THIS EXISTS SEPARATELY FROM `rehome`
 * `rehome --tenant <slug>` sweeps EVERY row still carrying `tenantId = null` into one
 * named tenant. That is correct for the original migration - the owner's whole funnel
 * moving to Apply Gita in one go - and wrong for the case this script serves.
 *
 * A super admin creating an assessment from /admin before the configTenantOf fix got a
 * row stamped `null`, landing it in the same bucket as the legacy funnel rows. Running
 * the sweep to recover it would file it under the funnel tenant along with everything
 * else, and `--tenant platform` would be worse: it would drag the live funnels onto the
 * Platform tenant, which by design holds no funnel at all.
 *
 * So: one assessment, named explicitly, plus the rows that belong to it across the eight
 * tables that carry both a tenant and an assessment. Nothing else is touched, and a row
 * that already has an owner is skipped rather than reassigned.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write. One transaction, so a failure part-way
 * leaves nothing half-moved.
 *
 *   railway run --environment production npx tsx scripts/adopt-assessment.ts --list
 *   railway run --environment production npx tsx scripts/adopt-assessment.ts --id <id>
 *   railway run --environment production npx tsx scripts/adopt-assessment.ts --id <id> --apply
 *
 * --tenant <slug> overrides the destination; the default is the Platform tenant, which
 * is where a super admin's own work belongs.
 */
import "./public-db-url";
import { prisma } from "../src/lib/db/prisma";
import { PLATFORM_TENANT_ID } from "../src/lib/tenant/platform-tenant";

const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = argv.indexOf(`--${name}`);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : null;
};
const has = (name: string): boolean => argv.includes(`--${name}`);

/** The tables carrying BOTH a tenant and an assessment, so a move must consider each. */
const CHILD_TABLES = [
  "submission",
  "pageView",
  "gateEntry",
  "gateDisqualification",
  "ctaClick",
  "funnelEventCount",
  "eventLog",
  "payment",
] as const;

interface ChildDelegate {
  count(args: { where: { assessmentId: string; tenantId: null } }): Promise<number>;
  updateMany(args: {
    where: { assessmentId: string; tenantId: null };
    data: { tenantId: string };
  }): Promise<{ count: number }>;
}
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const child = (tx: Tx | typeof prisma, name: string): ChildDelegate => {
  const d = (tx as unknown as Record<string, ChildDelegate | undefined>)[name];
  if (!d) throw new Error(`No Prisma delegate named "${name}" - the schema changed under this script.`);
  return d;
};

async function list(): Promise<void> {
  const rows = await prisma.assessment.findMany({
    where: { tenantId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, title: true, status: true, createdAt: true },
  });
  if (!rows.length) {
    console.log("No unowned assessments - every assessment already has a tenant.");
    return;
  }
  console.log(`${rows.length} assessment(s) with tenantId = null (invisible in the console):\n`);
  for (const r of rows) {
    console.log(`  ${r.createdAt.toISOString().slice(0, 16)}  ${r.status.padEnd(9)}  ${r.id}`);
    console.log(`      ${r.slug}  -  "${r.title}"`);
  }
  console.log("\nAdopt one with:  --id <id>   (add --apply to write)");
}

async function adopt(id: string, tenantId: string, apply: boolean): Promise<void> {
  const a = await prisma.assessment.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, tenantId: true },
  });
  if (!a) {
    console.error(`🔴 No assessment with id ${id}.`);
    process.exitCode = 1;
    return;
  }
  if (a.tenantId !== null) {
    // Not an error: it means somebody already adopted it. Reassigning an owned row is
    // exactly the kind of thing this script must never do quietly.
    console.log(`🟡 "${a.title}" already belongs to tenant ${a.tenantId}. Nothing to do.`);
    return;
  }
  const dest = await prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    select: { id: true, slug: true, name: true },
  });
  if (!dest) {
    console.error(`🔴 No tenant matching "${tenantId}".`);
    process.exitCode = 1;
    return;
  }

  console.log(`Assessment : "${a.title}" (${a.slug})`);
  console.log(`Destination: ${dest.name} [${dest.slug}]\n`);

  const counts: Record<string, number> = {};
  for (const t of CHILD_TABLES) {
    counts[t] = await child(prisma, t).count({ where: { assessmentId: id, tenantId: null } });
  }
  console.log("  assessment               1");
  for (const t of CHILD_TABLES) console.log(`  ${t.padEnd(24)} ${counts[t] ?? 0}`);
  const total = 1 + Object.values(counts).reduce((x, y) => x + y, 0);
  console.log(`  ${"total".padEnd(24)} ${total}`);

  if (!apply) {
    console.log("\n🟡 DRY RUN - nothing written. Re-run with --apply to move these rows.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.assessment.update({ where: { id }, data: { tenantId: dest.id } });
    for (const t of CHILD_TABLES) {
      if ((counts[t] ?? 0) > 0) {
        await child(tx, t).updateMany({
          where: { assessmentId: id, tenantId: null },
          data: { tenantId: dest.id },
        });
      }
    }
  });

  console.log(`\n🟢 Moved ${total} row(s) to ${dest.name}. The assessment is now visible in that scope.`);
  console.log("   Undo, if it was the wrong destination: set tenantId back to null for this assessment id.");
}

async function main(): Promise<void> {
  if (has("list") || argv.length === 0) {
    await list();
    return;
  }
  const id = flag("id");
  if (!id) {
    console.error("Usage: --list  |  --id <assessmentId> [--tenant <slug>] [--apply]");
    process.exitCode = 1;
    return;
  }
  await adopt(id, flag("tenant") ?? PLATFORM_TENANT_ID, has("apply"));
}

main()
  .catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Can't reach database server|P1001/.test(msg)) {
      console.error("\n🔴 No database - prefix with `railway run --environment production` (or orbitq-assess).");
    } else {
      console.error(msg);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
