/**
 * Prove the tenancy model is in the state you think it is.
 *
 *   npm run verify:tenancy                       # report on this database
 *   npm run verify:tenancy -- --funnel apply-gita  # also check the funnel's tenant
 *
 * Prefix with `railway run` (add `--environment production` for prod).
 *
 * Read-only: it writes nothing, so it is safe to run against production at any time.
 * Run it BEFORE the re-home (to see the starting state), AFTER each step (to confirm it
 * did what it claimed), and again before the later NOT NULL migration — that migration
 * fails halfway on any table this still reports as holding nulls, and the whole point of
 * checking here is to find those tables while failing is free.
 *
 * Exit code is 1 when any 🔴 check fails, so it can gate a deploy step.
 */
import "./public-db-url";
import { prisma } from "../src/lib/db/prisma";
import { PLATFORM_OWNER_EMAIL } from "../src/lib/auth/platform";
import { PLATFORM_TENANT_ID } from "../src/lib/tenant/platform-tenant";
import { resolvePlan } from "../src/lib/billing/plan-resolve";
import { hasFeature } from "../src/lib/billing/plans";

/**
 * Every model with a nullable tenant column, as the schema has it. Kept in step with the
 * re-home tool's TABLES list plus the two it deliberately excludes (user, appSetting).
 * To regenerate:
 *   awk '/^model /{m=$2} /tenantId +String\?/{print m}' prisma/schema.prisma
 */
const NULLABLE_TENANT_TABLES = [
  "assessment",
  "submission",
  "payment",
  "capiLog",
  "eventLog",
  "pageView",
  "ctaClick",
  "gateEntry",
  "gateDisqualification",
  "funnelEventCount",
  "nurtureLog",
  "webhook",
  "webhookLog",
  "webhookDelivery",
  "apiToken",
  "aiPromptVersion",
  "user",
  "appSetting",
] as const;

type TableName = (typeof NULLABLE_TENANT_TABLES)[number];

interface CountOnly {
  count(args?: { where: { tenantId: string | null } }): Promise<number>;
}

function delegate(name: TableName): CountOnly {
  return (prisma as unknown as Record<TableName, CountOnly>)[name];
}

/** Integration values a funnel tenant cannot run without, and what each one powers. */
const CRITICAL: { column: string; what: string }[] = [
  { column: "metaPixelId", what: "browser pixel events" },
  { column: "metaCapiTokenEnc", what: "server-side CAPI" },
  { column: "razorpayKeyId", what: "checkout" },
  { column: "razorpayKeySecretEnc", what: "order signing" },
  { column: "razorpayWebhookSecretEnc", what: "payment confirmation" },
];

let failures = 0;

function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "🟢" : "🔴"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function note(label: string, detail = "") {
  console.log(`  🟡 ${label}${detail ? ` — ${detail}` : ""}`);
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  console.log("=== Platform tenant ===");
  const platform = await prisma.tenant.findUnique({
    where: { id: PLATFORM_TENANT_ID },
    select: { id: true, slug: true, name: true, plan: true, status: true },
  });
  check(
    !!platform,
    `Platform tenant row exists (id "${PLATFORM_TENANT_ID}")`,
    platform ? `${platform.name} / ${platform.slug} / plan ${platform.plan} / ${platform.status}` : "run the 20260930000000_platform_tenant migration",
  );

  console.log("\n=== Owner account ===");
  const owner = await prisma.user.findFirst({
    where: { email: { equals: PLATFORM_OWNER_EMAIL, mode: "insensitive" } },
    select: { id: true, email: true, role: true, tenantId: true, deletedAt: true },
  });
  if (!owner) {
    check(false, `owner account exists (${PLATFORM_OWNER_EMAIL})`);
  } else {
    // The role is the thing that grants /admin. The tenant does not, which is exactly why
    // the DB backstop now guards the role and permits the tenant.
    check(owner.role === "SUPER_ADMIN", "owner is SUPER_ADMIN", `role=${owner.role}`);
    check(!owner.deletedAt, "owner is not soft-deleted");
    if (owner.tenantId === PLATFORM_TENANT_ID) {
      check(true, "owner belongs to the Platform tenant");
    } else if (owner.tenantId === null) {
      note("owner has no tenant", "the --platform step has not been run yet");
    } else {
      check(false, "owner belongs to the Platform tenant", `tenantId=${owner.tenantId}`);
    }
  }

  console.log("\n=== Platform settings row ===");
  const singleton = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  if (!singleton) {
    note('no AppSetting row with id "singleton"', "created the first time Settings is saved");
  } else if (singleton.tenantId === PLATFORM_TENANT_ID) {
    check(true, "singleton belongs to the Platform tenant");
  } else if (singleton.tenantId === null) {
    note("singleton has no tenant", "the --platform step has not been run yet");
  } else {
    check(false, "singleton belongs to the Platform tenant", `tenantId=${singleton.tenantId}`);
  }

  console.log("\n=== Rows still unowned (tenantId IS NULL) ===");
  console.log("  These are what the later NOT NULL migration will reject.\n");
  let nulls = 0;
  for (const name of NULLABLE_TENANT_TABLES) {
    const n = await delegate(name).count({ where: { tenantId: null } });
    nulls += n;
    // user/appSetting are excluded from the funnel move on purpose: the owner's account
    // and the platform settings row are handled by --platform, and OTHER users legitimately
    // have no tenant until they provision one. Report them, never fail on them.
    const informational = name === "user" || name === "appSetting";
    if (n === 0) console.log(`  🟢 ${name.padEnd(22)} 0`);
    else if (informational) console.log(`  🟡 ${name.padEnd(22)} ${n} (handled separately)`);
    else {
      failures++;
      console.log(`  🔴 ${name.padEnd(22)} ${n}`);
    }
  }
  console.log(`\n  total unowned rows: ${nulls}`);

  console.log("\n=== Tenants ===");
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      unlimited: true,
      _count: { select: { assessments: true, submissions: true } },
      subscription: { select: { plan: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const t of tenants) {
    const eff = t.unlimited ? "UNLTD" : (t.subscription?.plan ?? t.plan);
    console.log(
      `  ${t.slug.padEnd(18)} ${String(eff).padEnd(8)} assessments=${String(t._count.assessments).padEnd(5)}` +
        ` submissions=${t._count.submissions}${t.id === PLATFORM_TENANT_ID ? "   <- platform" : ""}`,
    );
  }

  const funnelSlug = arg("--funnel");
  if (funnelSlug) {
    console.log(`\n=== Funnel tenant "${funnelSlug}" ===`);
    const t = tenants.find((x) => x.slug === funnelSlug);
    if (!t) {
      check(false, `tenant "${funnelSlug}" exists`);
    } else {
      // Ask the same resolver the running app asks, rather than re-deriving the plan from
      // the columns: the tenant may be flagged INTERNAL, in which case the `plan` column
      // is ignored at runtime and reading it here reports a 🔴 that does not exist.
      const { plan, unlimited, limits } = await resolvePlan(t.id);
      const eff = unlimited ? "unlimited (internal)" : String(plan);
      check(
        hasFeature(limits, "capi"),
        "plan carries the CAPI entitlement",
        `effective plan ${eff}${hasFeature(limits, "capi") ? "" : " — FREE/STARTER have capi=false, which silently stops Meta CAPI and caps responses"}`,
      );
      const row = await prisma.appSetting.findUnique({ where: { tenantId: t.id } });
      if (!row) {
        check(false, "has its own AppSetting row", "a tenant never falls back to env, so a missing row is a dark funnel");
      } else {
        for (const c of CRITICAL) {
          const v = (row as unknown as Record<string, unknown>)[c.column];
          check(!isBlank(v), `${c.column} is set`, isBlank(v) ? `${c.what} will not work` : c.what);
        }
      }
    }
  } else {
    console.log("\n(Pass --funnel <slug> to also check the funnel tenant's plan and integration config.)");
  }

  console.log(
    failures === 0
      ? "\n🟢 All checks passed."
      : `\n🔴 ${failures} check(s) failed — see above.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("verify:tenancy failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
