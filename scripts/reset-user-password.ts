/**
 * Emergency password reset for a single user (bypasses the reset-email webhook).
 *
 * Sets a NEW password on the user's credential account, marks the email verified,
 * and clears the "must change password" flag so sign-in works immediately.
 * Hashes with Better Auth's OWN hasher so email+password sign-in verifies it.
 *
 * YOU choose the password — pass it on the command line. It is never stored in
 * this file or in git. Use a password of at least 8 characters (Better Auth min).
 *
 * Run against the target DB (DATABASE_URL must point at it):
 *   npx tsx scripts/reset-user-password.ts <email> "<new-password>"
 *
 * On Railway (runs against the linked environment/service's DATABASE_URL):
 *   railway run npx tsx scripts/reset-user-password.ts you@example.com "YourNewPass123"
 *
 * TIP: make sure the right environment is linked first — `railway status`.
 */
import { PrismaClient } from "@prisma/client";
import { resetCredentialPassword } from "../src/lib/auth/recover";

const prisma = new PrismaClient();

const email = process.argv[2];
const newPassword = process.argv[3];

async function main() {
  if (!email || !newPassword) {
    console.error('Usage: npx tsx scripts/reset-user-password.ts <email> "<new-password>"');
    process.exit(1);
  }

  // No superAdminOnly gate here — running this already requires DB access.
  // promoteOwner restores the platform owner to SUPER_ADMIN if it was demoted.
  const result = await resetCredentialPassword(email, newPassword, { promoteOwner: true });
  if (!result.ok) {
    console.error(`Reset failed: ${result.error}`);
    process.exit(1);
  }
  const note = result.promoted ? " (restored to SUPER_ADMIN)" : "";
  console.log(`Password reset for ${result.email}${note}. You can sign in now.`);
}

main()
  .catch((e) => {
    console.error("Reset failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
