/**
 * Seed (or re-seed) the built-in templates into the database.
 *
 *   npm run seed:templates
 *   railway run npm run seed:templates   (against the deployed database)
 *
 * This also runs at boot, fail-soft, so a deploy that changes a template JSON puts the
 * new content on the shelf without anyone remembering to do anything. The script stays
 * because a boot seed that failed should be re-runnable without a redeploy, and because
 * seeing the per-row outcome is worth having.
 *
 * Never destructive: it upserts by slug and leaves `published` and `displayOrder` alone
 * on rows that already exist.
 */

async function main() {
  // `--public` routes through Railway's public Postgres proxy, for running this from a
  // laptop against the deployed database. Opt-in and dynamic, because at BOOT this same
  // script runs INSIDE Railway, where the internal host is correct and free - importing
  // the shim unconditionally would send every deploy's seed through billed egress. Both
  // imports are dynamic and in this order: the shim rewrites DATABASE_URL, and Prisma
  // reads it when the client is constructed, so it has to run first.
  if (process.argv.includes("--public")) await import("./public-db-url");
  const { seedBuiltinTemplates } = await import("../src/features/templates/seed");

  const r = await seedBuiltinTemplates();
  console.log(`Templates seeded: ${r.created} created, ${r.updated} updated.`);
  for (const f of r.failed) console.log(`  FAILED  ${f.slug}: ${f.error}`);
  // A failed row is a content bug worth a non-zero exit in CI, but the boot path calls
  // the function directly and ignores this, so a bad template can never stop the app.
  process.exit(r.failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
