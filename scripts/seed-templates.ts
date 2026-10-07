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
import { seedBuiltinTemplates } from "../src/features/templates/seed";

async function main() {
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
