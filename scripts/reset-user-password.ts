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
 * Run it against the linked Railway environment (nothing runs locally — `railway
 * run` executes this file on your machine with that service's env injected):
 *   railway run npm run db:reset-password -- you@example.com "YourNewPass123"
 *
 * Use the npm script, not a bare `tsx` call. It adds --conditions=react-server,
 * which makes the `server-only` guard — pulled in through auth.ts ->
 * nurture/send.ts — resolve to its empty build. Without that flag the run dies
 * with "Cannot find module 'server-only'" (package absent; Next.js aliases it)
 * or, once installed, with "This module cannot be imported from a Client
 * Component module." The long form is:
 *   railway run npx tsx --conditions=react-server scripts/reset-user-password.ts ...
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
