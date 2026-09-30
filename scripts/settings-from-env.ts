/**
 * Copy integration values out of environment variables and into in-app Settings.
 *
 * WHY THIS EXISTS
 * Environment variables hold only what the process needs to BOOT — database URL, auth
 * secret, app URL, object storage. Every integration value (Meta pixel and CAPI token,
 * Razorpay keys) belongs in Settings, stored per tenant, because a per-tenant value
 * cannot live in one process-wide variable without every tenant inheriting the same one.
 *
 * Those values are currently read from env as a TRANSITIONAL fallback, and that fallback
 * applies to the platform scope only. So the moment the funnel moves onto its own tenant,
 * anything still living in env simply stops applying: no pixel, no CAPI, and a checkout
 * that cannot sign an order — with nothing in the admin looking wrong. This script closes
 * that gap before the move, which is why the re-home preflight points at it.
 *
 *   npm run settings:from-env              # DRY RUN — reports the gap, writes nothing
 *   npm run settings:from-env -- --apply   # write the missing values into Settings
 *
 * Prefix with `railway run` (add `--environment production` for prod) so the service's
 * variables and DATABASE_URL are the ones being read.
 *
 * It only ever FILLS BLANKS on the platform's settings row. A value already entered in
 * Settings always wins and is never overwritten, so running this after someone has
 * deliberately changed a key in the UI cannot silently put the old env value back.
 *
 * 🔴 Secrets are encrypted with BETTER_AUTH_SECRET. Run this against the SAME
 * environment whose secret is in use — ciphertext written under one secret cannot be
 * decrypted under another, so a row copied between staging and production is unreadable.
 */
import "./public-db-url";
import { prisma } from "../src/lib/db/prisma";
import { encryptWithSecret } from "../src/lib/crypto";
import { PLATFORM_TENANT_ID } from "../src/lib/tenant/platform-tenant";

/**
 * Which env var feeds which Settings column. `encrypt` marks a secret: the column stores
 * ciphertext (the `...Enc` suffix), so the plaintext from env is encrypted on the way in
 * and never stored or logged in the clear.
 */
const MAP: { env: string; column: string; encrypt: boolean; what: string }[] = [
  { env: "NEXT_PUBLIC_META_PIXEL_ID", column: "metaPixelId", encrypt: false, what: "browser pixel events" },
  { env: "META_CAPI_ACCESS_TOKEN", column: "metaCapiTokenEnc", encrypt: true, what: "server-side CAPI" },
  { env: "RAZORPAY_KEY_ID", column: "razorpayKeyId", encrypt: false, what: "checkout" },
  { env: "RAZORPAY_KEY_SECRET", column: "razorpayKeySecretEnc", encrypt: true, what: "order signing" },
  { env: "RAZORPAY_WEBHOOK_SECRET", column: "razorpayWebhookSecretEnc", encrypt: true, what: "payment confirmation" },
];

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/** Never print a secret. Enough to tell two values apart, not enough to use one. */
function redact(v: string): string {
  return v.length <= 8 ? "*".repeat(v.length) : `${v.slice(0, 4)}…${v.slice(-2)} (${v.length} chars)`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    console.error(
      "BETTER_AUTH_SECRET is not set. It is the key the stored secrets are encrypted with, so\n" +
        "without it this cannot write them. Run under `railway run` so the service's variables\n" +
        "are injected.",
    );
    process.exit(1);
  }

  const row = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  if (!row) {
    console.error(
      'No AppSetting row with id "singleton". The platform settings row is created the first\n' +
        "time Settings is saved in the app — open super-admin Settings, save once, then re-run.",
    );
    process.exit(1);
  }
  console.log(
    `Platform settings row: id=${row.id} tenant=${row.tenantId ?? "null (not yet re-homed)"}`,
  );
  console.log(apply ? "\nMODE: APPLY — this writes.\n" : "\nMODE: DRY RUN — nothing is written.\n");

  const data: Record<string, string> = {};
  const skipped: string[] = [];
  const absent: string[] = [];

  for (const m of MAP) {
    const envValue = process.env[m.env];
    const stored = (row as unknown as Record<string, unknown>)[m.column];

    if (!isBlank(stored)) {
      // Settings always wins. Say so explicitly, including when env disagrees, so a
      // stale env var is visible as something to delete rather than a silent no-op.
      skipped.push(
        `${m.column} already set in Settings${isBlank(envValue) ? "" : ` (${m.env} is also set — Settings wins; the env var can be removed)`}`,
      );
      continue;
    }
    if (isBlank(envValue)) {
      absent.push(`${m.column} blank in Settings and ${m.env} not set — ${m.what} is unconfigured`);
      continue;
    }
    data[m.column] = m.encrypt ? encryptWithSecret(envValue as string, secret) : (envValue as string);
    console.log(
      `  will write ${m.column.padEnd(26)} from ${m.env.padEnd(26)} ` +
        `${m.encrypt ? `encrypted, ${redact(envValue as string)}` : (envValue as string)}`,
    );
  }

  if (skipped.length > 0) {
    console.log("\nAlready in Settings (left alone):");
    for (const s of skipped) console.log(`  - ${s}`);
  }
  if (absent.length > 0) {
    console.log("\n🟡 Nowhere to copy from — enter these in Settings by hand:");
    for (const a of absent) console.log(`  - ${a}`);
  }

  const keys = Object.keys(data);
  if (keys.length === 0) {
    console.log("\n🟢 Nothing to copy: every value is either already in Settings or absent from env.");
    return;
  }
  if (!apply) {
    console.log(`\nDry run complete. ${keys.length} value(s) would be written. Re-run with --apply.`);
    return;
  }

  await prisma.appSetting.update({ where: { id: row.id }, data });
  console.log(`\n🟢 Wrote ${keys.length} value(s) into Settings: ${keys.join(", ")}`);
  console.log(
    "These environment variables are now redundant for the app's behaviour. Leave them in place\n" +
      "until the re-home is verified on this environment, then remove them — the code still reads\n" +
      "env as a fallback for the platform scope, and that fallback is what gets deleted last.",
  );
  if (row.tenantId !== PLATFORM_TENANT_ID) {
    console.log(
      `\nNote: this row is not yet stamped as the Platform tenant. Run` +
        " `npm run rehome -- --platform --apply` when you are ready; it does not affect these values.",
    );
  }
}

main()
  .catch((e) => {
    console.error("settings:from-env failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
