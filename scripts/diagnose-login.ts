/** READ-ONLY login diagnostic: why can't <email or tenant> sign in?
 *  Usage: railway run --environment production npx tsx scripts/diagnose-login.ts <search>
 *  Prints no password hashes - only whether one exists. */
import "./public-db-url";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const q = (process.argv[2] ?? "divine").toLowerCase();

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] },
    select: { id: true, name: true, slug: true, deletedAt: true },
  });
  console.log("TENANTS:", JSON.stringify(tenants, null, 2));
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { tenantId: { in: tenants.map((t) => t.id) } },
      ],
    },
    select: {
      id: true, name: true, email: true, role: true, tenantId: true, emailVerified: true,
      deletedAt: true, mustChangePassword: true, staffPermission: true, createdAt: true,
      accounts: { select: { providerId: true, accountId: true, password: true, updatedAt: true } },
      sessions: { select: { expiresAt: true } },
    },
  });
  for (const u of users) {
    console.log("USER", JSON.stringify({
      id: u.id, name: u.name, email: u.email, emailHasUpper: u.email !== u.email.toLowerCase(),
      role: u.role, tenantId: u.tenantId, tenant: tenants.find((t) => t.id === u.tenantId)?.slug ?? null,
      emailVerified: u.emailVerified, deletedAt: u.deletedAt, mustChangePassword: u.mustChangePassword,
      staffPermission: u.staffPermission, createdAt: u.createdAt,
      accounts: u.accounts.map((a) => ({
        providerId: a.providerId, accountIdMatchesUser: a.accountId === u.id,
        hasPassword: !!a.password, hashPrefix: a.password ? a.password.slice(0, 7) : null,
        updatedAt: a.updatedAt,
      })),
      liveSessions: u.sessions.filter((s) => s.expiresAt > new Date()).length,
    }, null, 2));
  }
  if (!users.length) console.log("No users matched.");
}
main().finally(() => prisma.$disconnect());
