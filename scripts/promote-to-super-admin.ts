/**
 * Promote a single user to SUPER_ADMIN.
 *
 * Sets role = SUPER_ADMIN and tenantId = null for exactly one user (matched by
 * email). No other users are modified.
 *
 * Run (with DATABASE_URL pointing at the target DB):
 *   npx tsx scripts/promote-to-super-admin.ts
 *   npx tsx scripts/promote-to-super-admin.ts someone.else@example.com
 *
 * On Railway (orbitq-assess env): `railway run npx tsx scripts/promote-to-super-admin.ts`
 */
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const email = process.argv[2] ?? "ganganarayan.rns@gmail.com";

async function main() {
  const updated = await prisma.user.update({
    where: { email },
    data: { role: Role.SUPER_ADMIN, tenantId: null },
  });

  console.log("Promoted to SUPER_ADMIN:");
  console.log({
    email: updated.email,
    role: updated.role,
    tenantId: updated.tenantId,
  });
}

main()
  .catch((e) => {
    console.error(`Failed to promote ${email}:`, e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
