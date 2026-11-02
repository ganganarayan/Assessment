/**
 * Seed (or re-seed) the built-in templates into the database.
 *
 *   npm run seed:templates
 *   railway run npm run seed:templates   (against the deployed database)
 *
 * 🔴 THIS IS THE ONLY THING THAT RUNS IT. It does NOT run at boot.
 *
 * The comment here used to say it did, and nothing ever called it: `instrumentation.ts`
 * does not, and the `reseedBuiltinTemplates` server action has no control wired to it.
 * So changing a template JSON in the repo and deploying puts NOTHING new on the shelf -
 * somebody has to run the command above against the environment. That is the arrangement
 * on purpose (the owner's call: a deploy should not quietly rewrite library content), and
 * it is written down here because a comment claiming otherwise is how a template change
 * gets reported as shipped when it is still only in git.
 *
 * Never destructive: it upserts by slug and leaves `published` and `displayOrder` alone
 * on rows that already exist.
 */

async function main() {
  // `--public` routes through Railway's public Postgres proxy, for running this from a
  // laptop against the deployed database. Opt-in and dynamic, because the same command
  // is also run INSIDE Railway (`railway run`), where the internal host is correct and
  // free - importing the shim unconditionally would send that run through billed
  // egress rather than over the internal network. Both
  // imports are dynamic and in this order: the shim rewrites DATABASE_URL, and Prisma
  // reads it when the client is constructed, so it has to run first.
  if (process.argv.includes("--public")) await import("./public-db-url");
  const { seedBuiltinTemplates } = await import("../src/features/templates/seed");

  const r = await seedBuiltinTemplates();
  console.log(`Templates seeded: ${r.created} created, ${r.updated} updated.`);
  for (const f of r.failed) console.log(`  FAILED  ${f.slug}: ${f.error}`);
  // A failed row is a content bug worth a non-zero exit, so running this in CI fails
  // loudly. Per-row fail-soft inside the seeder means the other rows still landed.
  process.exit(r.failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// A module, not a global script: both of these declare `main`, and without an
// export tsc treats them as one shared global scope and calls it a duplicate.
export {};
