/**
 * Take every built-in template off the shelf.
 *
 *   npm run templates:unpublish             (local database)
 *   railway run npm run templates:unpublish -- --public   (the deployed one)
 *
 * The counterpart to the rule in features/templates/seed.ts: a seeded template arrives
 * UNPUBLISHED and nothing in the seeder can ever publish one. That rule protects rows
 * created from now on, and does nothing for rows that already exist - including the
 * eight that were seeded published during the one commit where new built-ins arrived
 * on the shelf. This is how those get taken back off without the owner unticking eight
 * boxes by hand.
 *
 * Built-ins ONLY. A contributed template that the owner has reviewed and published is
 * somebody else's accepted work and is not this script's to withdraw.
 */

async function main() {
  if (process.argv.includes("--public")) await import("./public-db-url");
  const { prisma } = await import("../src/lib/db/prisma");

  const { count } = await prisma.template.updateMany({
    where: { builtin: true, published: true },
    data: { published: false },
  });
  const total = await prisma.template.count({ where: { builtin: true } });
  const visible = await prisma.template.count({
    where: { ownerTenantId: null, published: true, reviewStatus: "APPROVED" },
  });

  console.log(`Unpublished ${count} of ${total} built-in template(s).`);
  console.log(
    visible === 0
      ? "No template is visible to any tenant."
      : `${visible} template(s) are still published and visible to tenants.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// A module, not a global script: both of these declare `main`, and without an
// export tsc treats them as one shared global scope and calls it a duplicate.
export {};
