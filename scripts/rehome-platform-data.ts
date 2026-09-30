/**
 * Re-home platform (null-tenant) data into a real tenant.
 *
 * The platform owner's data lives with `tenantId = null` — the "platform/Gita"
 * convention from the multi-tenant build. This moves it into a named tenant so
 * the owner becomes a tenant like any other, leaving the null scope for the
 * SaaS platform itself.
 *
 *   npm run rehome -- --tenant apply-gita            # DRY RUN (default)
 *   npm run rehome -- --tenant apply-gita --apply    # move, writing a manifest
 *   npm run rehome -- --revert .rehome/<file>.json   # put every moved row back
 *
 * Prefix with `railway run` (add `--environment production` for prod) so the
 * linked service's DATABASE_URL is injected; ./public-db-url swaps in the
 * public proxy host so it works from a laptop.
 *
 * DELIBERATE EXCLUSIONS
 *  - User: the owner row stays SUPER_ADMIN with tenantId null. Attaching the
 *    owner to a tenant is what caused the 21 Sept lockout, and the backstop in
 *    lib/db/prisma.ts throws on it anyway.
 *  - AppSetting (singleton): stays as the PLATFORM row. Its values are COPIED
 *    to the tenant's row instead — tenants never fall back to env for
 *    pixel/CAPI/Razorpay/AI, so a tenant row missing them is a dark funnel.
 *
 * Everything runs in ONE transaction. The manifest records every moved id, so
 * --revert is exact and never touches rows the tenant already owned.
 */
import "./public-db-url";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { prisma } from "../src/lib/db/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Minimal structural view of a tenant-scoped delegate. Prisma's generated
 * delegates support these calls but their generics differ per model, so each is
 * narrowed through this shape at the call site.
 */
interface TenantScopedDelegate {
  findMany(args: {
    where: { tenantId: string | null };
    select: { id: true };
  }): Promise<{ id: string }[]>;
  updateMany(args: {
    where: { id: { in: string[] } };
    data: { tenantId: string | null };
  }): Promise<{ count: number }>;
  count(args?: { where: { tenantId: string | null } }): Promise<number>;
}

type Tx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** The 14 tenant-scoped tables that move. Order is irrelevant — no FK breaks. */
const TABLES = [
  "assessment",
  "submission",
  "payment",
  "capiLog",
  "eventLog",
  "pageView",
  "ctaClick",
  "gateDisqualification",
  "nurtureLog",
  "webhook",
  "webhookLog",
  "webhookDelivery",
  "apiToken",
  "aiPromptVersion",
] as const;

type TableName = (typeof TABLES)[number];

function delegate(client: Tx, name: TableName): TenantScopedDelegate {
  return (client as unknown as Record<TableName, TenantScopedDelegate>)[name];
}

/** AppSetting columns that are never copied between rows. */
const SETTINGS_SKIP = new Set(["id", "tenantId", "createdAt", "updatedAt"]);

/** Fields the moved funnel cannot run without. */
const CRITICAL = [
  "metaPixelId",
  "metaCapiTokenEnc",
  "razorpayKeyId",
  "razorpayKeySecretEnc",
  "razorpayWebhookSecretEnc",
];

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function field(row: object | null, key: string): unknown {
  return row ? (row as unknown as Record<string, unknown>)[key] : null;
}

interface Manifest {
  createdAt: string;
  tenantId: string;
  tenantSlug: string;
  moved: Record<string, string[]>;
  settingsCopied: string[];
}

async function revert(path: string) {
  const m = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  console.log(`Reverting manifest from ${m.createdAt} (tenant ${m.tenantSlug})`);

  const counts = await prisma.$transaction(
    async (tx) => {
      const out: Record<string, number> = {};
      for (const [name, ids] of Object.entries(m.moved)) {
        if (ids.length === 0) continue;
        const r = await delegate(tx, name as TableName).updateMany({
          where: { id: { in: ids } },
          data: { tenantId: null },
        });
        out[name] = r.count;
      }
      return out;
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v} back to null`);
  if (m.settingsCopied.length > 0) {
    console.log(
      `\nNOTE: ${m.settingsCopied.length} AppSetting field(s) were copied to the tenant and are NOT ` +
        `reverted — copying never overwrote a tenant value: ${m.settingsCopied.join(", ")}`,
    );
  }
}

async function main() {
  const revertPath = arg("--revert");
  if (revertPath) return revert(revertPath);

  const slug = arg("--tenant");
  const apply = process.argv.includes("--apply");
  if (!slug) {
    console.error("Usage: npm run rehome -- --tenant <slug> [--apply]");
    console.error("       npm run rehome -- --revert <manifest.json>");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    const all = await prisma.tenant.findMany({ select: { slug: true } });
    console.error(
      `No tenant with slug "${slug}". Existing: ${all.map((t) => t.slug).join(", ") || "(none)"}`,
    );
    process.exit(1);
  }

  const admins = await prisma.user.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { email: true, role: true },
  });
  console.log(`Target tenant: ${tenant.name} (${tenant.slug}) ${tenant.id}`);
  console.log(
    `Its admins:    ${admins.map((a) => `${a.email} [${a.role}]`).join(", ") || "(none)"}`,
  );
  console.log(apply ? "\nMODE: APPLY — this writes.\n" : "\nMODE: DRY RUN — nothing is written.\n");

  // The null scope is unmetered and has every feature. A tenant does not: the
  // billing gates start applying the moment these rows belong to one. On FREE
  // that silently kills CAPI, caps responses at 25/month and disables the
  // qualification gate, conditional routing, heatmap and API access.
  const billing = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { plan: true, subscription: { select: { plan: true, status: true } } },
  });
  const effectivePlan = billing?.subscription?.plan ?? billing?.plan ?? "FREE";
  console.log(
    `Plan: ${effectivePlan}` +
      (billing?.subscription ? ` (subscription ${billing.subscription.status})` : " (no subscription)"),
  );
  if (effectivePlan === "FREE" || effectivePlan === "STARTER") {
    console.log(
      `  WARNING: ${effectivePlan} has capi=false. Moving the funnel here STOPS Meta CAPI,\n` +
        "           locks responses past the monthly cap, and disables the qualification\n" +
        "           gate, conditional routing, heatmap and API tokens.\n" +
        "           Fix first:  UPDATE tenant SET plan = 'SCALE' WHERE slug = '" +
        tenant.slug +
        "';",
    );
  }


  console.log("Rows with tenantId = null (these move):");
  let total = 0;
  for (const name of TABLES) {
    const n = await delegate(prisma, name).count({ where: { tenantId: null } });
    total += n;
    console.log(`  ${name.padEnd(22)} ${n}`);
  }
  console.log(`  ${"TOTAL".padEnd(22)} ${total}`);

  const singleton = await prisma.appSetting.findFirst({ where: { tenantId: null } });
  const target = await prisma.appSetting.findFirst({ where: { tenantId: tenant.id } });
  const toCopy: string[] = [];
  const kept: string[] = [];

  if (!singleton) {
    console.log("\nNo platform AppSetting row — nothing to copy.");
  } else {
    for (const [k, v] of Object.entries(singleton)) {
      if (SETTINGS_SKIP.has(k) || isBlank(v)) continue;
      const cur = field(target, k);
      if (isBlank(cur)) toCopy.push(k);
      else if (cur !== v) kept.push(k);
    }
    console.log(`\nAppSetting: tenant row ${target ? "exists" : "MISSING (will be created)"}`);
    console.log(`  copy (tenant blank):               ${toCopy.join(", ") || "(none)"}`);
    console.log(`  KEPT (tenant differs, left alone): ${kept.join(", ") || "(none)"}`);

    const missing = CRITICAL.filter(
      (c) => isBlank(field(singleton, c)) && isBlank(field(target, c)),
    );
    if (missing.length > 0) {
      console.log(
        `  WARNING: blank on BOTH rows — the moved funnel has no value for: ${missing.join(", ")}`,
      );
    }
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to perform the move.");
    return;
  }

  const manifest: Manifest = {
    createdAt: new Date().toISOString(),
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    moved: {},
    settingsCopied: toCopy,
  };

  await prisma.$transaction(
    async (tx) => {
      for (const name of TABLES) {
        const d = delegate(tx, name);
        const rows = await d.findMany({ where: { tenantId: null }, select: { id: true } });
        const ids = rows.map((r) => r.id);
        manifest.moved[name] = ids;
        if (ids.length > 0) {
          await d.updateMany({ where: { id: { in: ids } }, data: { tenantId: tenant.id } });
        }
      }

      if (singleton && toCopy.length > 0) {
        const data: Record<string, unknown> = {};
        for (const k of toCopy) data[k] = field(singleton, k);
        if (target) {
          await tx.appSetting.update({
            where: { id: target.id },
            data: data as Prisma.AppSettingUncheckedUpdateInput,
          });
        } else {
          await tx.appSetting.create({
            data: {
              ...data,
              id: `set_${tenant.id}`,
              tenantId: tenant.id,
            } as Prisma.AppSettingUncheckedCreateInput,
          });
        }
      }
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  const out = join(".rehome", `rehome-${tenant.slug}-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(manifest, null, 2), "utf8");

  for (const name of TABLES) console.log(`  moved ${name}: ${manifest.moved[name]?.length ?? 0}`);
  console.log(`  AppSetting fields copied: ${toCopy.length}`);
  console.log(`\nDone. Manifest: ${out}`);
  console.log(`Undo with: npm run rehome -- --revert ${out}`);
}

main()
  .catch((e) => {
    console.error("rehome failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
