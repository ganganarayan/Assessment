/**
 * Create (or refresh) the login the QA screen pass signs in with, and put its
 * password where only the harness reads it.
 *
 * WHY THIS EXISTS. `npm run qa:screens` opens the owner's own screens, so four of its
 * five groups need a real session - and the honest way to get one is to type a password
 * into the real form, because a session the harness can mint and the product cannot is a
 * session that proves nothing. That password should not be the owner's: it would have to
 * be handed around to run a test. So this makes a dedicated account instead, with a
 * password generated here, written straight into qa/.env.qa (gitignored) and never
 * printed, so nobody - including whoever ran this - has to know it.
 *
 * WHAT IT WRITES. One user row and one credential account row, hashed with Better Auth's
 * OWN hasher (ctx.password.hash) so email+password sign-in verifies it. Deliberately NOT
 * auth.api.signUpEmail, which is the public signup path: that fires the session hooks -
 * tenant provisioning, the welcome email, attribution - and this account must be inert.
 *
 * Re-running it is safe and is the way to rotate: the user is matched by email, the
 * password replaced, the role restored.
 *
 * 🔴 STAGING ONLY. It refuses to run against anything but a Railway proxy host, because
 * the failure it is guarding against is silent: with a local DATABASE_URL it would cheerfully
 * create the account in the laptop's database and report success, and the sign-in would
 * then fail on staging for a reason nothing on screen could explain.
 *
 *   BETTER_AUTH_SECRET=<any 16+ chars> BETTER_AUTH_URL=https://orbitq-assess.applygitawisdom.com railway run npm run qa:admin
 *
 * `railway run` injects the Postgres service's DATABASE_URL (the internal host) alongside
 * DATABASE_PUBLIC_URL, and public-db-url.ts swaps in the one that resolves from a laptop.
 * The two auth variables are there only to satisfy lib/env's validation: Better Auth hashes
 * with scrypt, so the secret plays no part in the password this stores, and a throwaway
 * value keeps the real one out of the command line.
 *
 * The --conditions=react-server flag is not optional: auth.ts pulls in nurture/send.ts,
 * which is `server-only`, and without it the run dies on import.
 */
import "./public-db-url";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, Role } from "@prisma/client";
import { auth } from "../src/lib/auth/auth";

const prisma = new PrismaClient();
const EMAIL = (process.argv[2] ?? "qa-screens@qa.invalid").trim().toLowerCase();
const ENV_FILE = join(process.cwd(), "qa", ".env.qa");

/** The host of the database about to be written to, with the credentials dropped. */
function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host;
  } catch {
    return "";
  }
}

/**
 * A password nobody needs to read: 24 url-safe characters from the system CSPRNG, which
 * is both long enough to be uninteresting and plain enough to survive a .env line and a
 * form fill without quoting.
 */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

/** Replace a KEY=... line in the env file, or append it when the key is not there. */
function setEnvLine(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
}

async function main(): Promise<void> {
  const host = dbHost();
  if (!host || /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) || /\.railway\.internal/.test(host)) {
    console.error(
      `Refusing to run against "${host || "an unreadable DATABASE_URL"}".\n` +
        "This needs the Railway PUBLIC proxy host - the internal one does not resolve from a\n" +
        "laptop, and a local database would take the account and leave staging without it.",
    );
    process.exit(1);
  }
  console.log(`Database: ${host}`);
  console.log(`Account:  ${EMAIL}`);

  const password = generatePassword();
  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(password);

  const existing = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: "insensitive" } },
    select: { id: true, loginCount: true },
  });

  // loginCount is pushed past the welcome-modal window on purpose. That modal blocks the
  // first five logins of a new account, and a blocking modal over the screen under test
  // would read as every check failing at once.
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: Role.SUPER_ADMIN,
          tenantId: null,
          emailVerified: true,
          mustChangePassword: false,
          deletedAt: null,
          staffPermission: null,
          loginCount: Math.max(existing.loginCount, 50),
        },
        select: { id: true },
      })
    : await prisma.user.create({
        data: {
          name: "QA Screens",
          email: EMAIL,
          role: Role.SUPER_ADMIN,
          emailVerified: true,
          loginCount: 50,
        },
        select: { id: true },
      });

  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });
  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { password: hashed } });
  } else {
    await prisma.account.create({
      data: { accountId: user.id, providerId: "credential", password: hashed, userId: user.id },
    });
  }

  const base = existsSync(ENV_FILE)
    ? readFileSync(ENV_FILE, "utf8")
    : readFileSync(join(process.cwd(), "qa", ".env.qa.example"), "utf8");
  let next = setEnvLine(base, "QA_ADMIN_EMAIL", EMAIL);
  next = setEnvLine(next, "QA_ADMIN_PASSWORD", password);
  writeFileSync(ENV_FILE, next);

  console.log(existing ? "Password rotated." : "Account created.");
  console.log("Its password was written to qa/.env.qa and printed nowhere.");
}

main()
  .catch((e) => {
    console.error("create-qa-admin failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
