/**
 * Re-home platform (null-tenant) data into real tenants.
 *
 * The owner's data grew up with `tenantId = null`, which came to mean five different
 * things at once. This moves it into real tenant rows so the null scope can disappear
 * (see src/lib/tenant/platform-tenant.ts for the model).
 *
 * TWO tenants, so TWO steps, run in this order:
 *
 *   1. npm run rehome -- --platform            # DRY RUN
 *      npm run rehome -- --platform --apply
 *      Attaches the OWNER's account to the Platform tenant and stamps the singleton
 *      AppSetting as the Platform tenant's row. Touches no funnel data, so it is the
 *      safe half — do it first and confirm you can still sign in.
 *
 *   2. npm run rehome -- --tenant apply-gita            # DRY RUN
 *      npm run rehome -- --tenant apply-gita --apply
 *      Moves the funnel: leads, payments, events, webhooks, tokens, prompts. This is
 *      the half that can take a live funnel dark, so --apply is GATED by a preflight
 *      (plan + integration config). Fix what it reports; do not bypass it blind.
 *
 *   npm run rehome -- --revert .rehome/<file>.json      # exact undo of either step
 *
 * Prefix with `railway run` (add `--environment production` for prod) so the linked
 * service's DATABASE_URL is injected; ./public-db-url swaps in the public proxy host
 * so it works from a laptop.
 *
 * Everything runs in ONE transaction per step. The manifest records every row it
 * touched, so --revert is exact and never disturbs rows the tenant already owned.
 */
import "./public-db-url";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { prisma } from "../src/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { PLATFORM_OWNER_EMAIL } from "../src/lib/auth/platform";
import { PLATFORM_TENANT_ID } from "../src/lib/tenant/platform-tenant";
import { tenantAppSettingId } from "../src/lib/settings/tenant-row";

/**
 * Minimal structural view of a tenant-scoped delegate. Prisma's generated delegates
 * support these calls but their generics differ per model, so each is narrowed through
 * this shape at the call site.
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

/**
 * Every tenant-scoped table that moves with the funnel. Order is irrelevant — no FK
 * breaks, because each row's tenant is a column, not a parent it must follow.
 *
 * 🔴 This list must stay exhaustive. `gateEntry` and `funnelEventCount` were missing
 * from it originally, which would have left both tables' rows pointing at null after a
 * "successful" move — the gate counters and the funnel-event day counters would have
 * quietly stopped matching the funnel they belong to, and the later NOT NULL migration
 * would then have failed on tables nobody was watching. To check this list against the
 * schema, print every model with a nullable tenant column:
 *
 *   awk '/^model /{m=$2} /tenantId +String\?/{print m}' prisma/schema.prisma
 *
 * and account for every name it prints. User and AppSetting are handled by --platform.
 */
const TABLES = [
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
] as const;

type TableName = (typeof TABLES)[number];

function delegate(client: Tx, name: TableName): TenantScopedDelegate {
  return (client as unknown as Record<TableName, TenantScopedDelegate>)[name];
}

/**
 * AppSetting columns that are never copied to a tenant.
 *
 * Row plumbing, plus every PLATFORM-ONLY setting. The copy is otherwise
 * everything-not-listed, which quietly meant the platform's legal entity, its SaaS
 * signup pixel, its CRM automation endpoints, its password-reset webhook and its
 * marketing videos would all be handed to the funnel tenant.
 *
 * Most of those are inert today only because their readers address the singleton by
 * id — the moment any one becomes per-tenant it starts firing with the platform's
 * values under a tenant's name. And copying a company's legal details and webhook
 * URLs into a tenant row is wrong on its own terms, inert or not.
 *
 * The rule for adding to this list: does this setting describe ASSESS360 (the SaaS
 * that sells to tenants), or does it describe the business running the funnel? Only
 * the first belongs here. Anything a tenant legitimately needs its own copy of —
 * pixel, CAPI token, Razorpay keys, SMTP, support address, stats window, heatmap,
 * VidaPulse — is NOT platform-only: the platform keeps its values on the singleton
 * and the tenant gets its own, and they are free to differ afterwards.
 */
const SETTINGS_SKIP = new Set([
  // Row plumbing.
  "id",
  "tenantId",
  "createdAt",
  "updatedAt",

  // The Assess360 SaaS signup funnel — a different pixel from the assessment one.
  "platformPixelId",
  "platformCapiTokenEnc",

  // Assess360's own legal entity, shown on /privacy, /terms and /refund.
  "legalEntityName",
  "legalAddress",
  "legalContactEmail",
  "legalGoverningLocation",

  // Platform auth: fires for every user's password reset, tenants' included.
  "passwordResetWebhookUrl",

  // Marketing site.
  "landingVideos",

  // CRM / WhatsApp automation is singleton-only by decision, not per-tenant.
  "crmResendUrl",
  "crmDripActive",
  "crmScoreStartHour",
  "crmScoreEndHour",
  "crmScoreDelayMin",
  "crmScoreDelayMax",
  "crmDiagnosisUrl",
  "crmCustomName",
  "crmCustomEventType",
  "crmCustomFields",
  "crmCustomStartHour",
  "crmCustomEndHour",
  "crmCustomDelayMin",
  "crmCustomDelayMax",
  "crmCustomActive",
]);

/**
 * Fields the moved funnel cannot run without, and the environment variable that used to
 * cover for each one. The env fallback applies to the PLATFORM scope only — the moment
 * these rows belong to a business tenant, a blank field is simply blank: no pixel, no
 * CAPI, and a checkout that cannot sign an order. That is why a blank here blocks
 * --apply rather than warning.
 */
const CRITICAL: { field: string; env: string; what: string }[] = [
  { field: "metaPixelId", env: "NEXT_PUBLIC_META_PIXEL_ID", what: "browser pixel events" },
  { field: "metaCapiTokenEnc", env: "META_CAPI_ACCESS_TOKEN", what: "server-side CAPI" },
  { field: "razorpayKeyId", env: "RAZORPAY_KEY_ID", what: "checkout" },
  { field: "razorpayKeySecretEnc", env: "RAZORPAY_KEY_SECRET", what: "order signing" },
  { field: "razorpayWebhookSecretEnc", env: "RAZORPAY_WEBHOOK_SECRET", what: "payment confirmation" },
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
  step: "platform" | "tenant";
  tenantId: string;
  tenantSlug: string;
  moved: Record<string, string[]>;
  settingsCopied: string[];
  /** --platform only: what the owner/singleton looked like before, for an exact undo. */
  platformUndo?: {
    ownerUserId: string | null;
    ownerPreviousTenantId: string | null;
    singletonSettingId: string | null;
    singletonPreviousTenantId: string | null;
  };
}

function writeManifest(m: Manifest, label: string): string {
  const out = join(".rehome", `rehome-${label}-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(m, null, 2), "utf8");
  return out;
}

// ---------------------------------------------------------------------------
// Step 1 — the platform half: the owner's account and the platform settings row
// ---------------------------------------------------------------------------

async function platformStep(apply: boolean) {
  const platform = await prisma.tenant.findUnique({
    where: { id: PLATFORM_TENANT_ID },
    select: { id: true, slug: true, name: true, plan: true },
  });
  if (!platform) {
    console.error(
      `No Platform tenant row (id "${PLATFORM_TENANT_ID}"). It is created by the\n` +
        "20260930000000_platform_tenant migration — deploy that first, or run\n" +
        "npx prisma migrate deploy against this database.",
    );
    process.exit(1);
  }
  console.log(
    `Platform tenant: ${platform.name} (${platform.slug}) ${platform.id} — plan ${platform.plan}`,
  );
  console.log(apply ? "\nMODE: APPLY — this writes.\n" : "\nMODE: DRY RUN — nothing is written.\n");

  const owner = await prisma.user.findFirst({
    where: { email: { equals: PLATFORM_OWNER_EMAIL, mode: "insensitive" } },
    select: { id: true, email: true, role: true, tenantId: true },
  });
  if (!owner) {
    console.error(`No user with the owner email ${PLATFORM_OWNER_EMAIL}. Nothing to attach.`);
    process.exit(1);
  }
  console.log(`Owner: ${owner.email} [${owner.role}] tenant=${owner.tenantId ?? "null"}`);

  if (owner.role !== "SUPER_ADMIN") {
    // The DB backstop refuses to write this account BELOW super admin; it does not
    // repair an account already below it. Stop rather than attach a tenant to an
    // account that would then have no way into the platform console.
    console.error(
      `  REFUSING: the owner's role is ${owner.role}, not SUPER_ADMIN. Fix the role first\n` +
        "  (scripts/promote-to-super-admin.ts, or /api/admin/recover) — attaching a tenant to a\n" +
        "  demoted owner would leave no route back into /admin.",
    );
    process.exit(1);
  }

  const ownerNeedsMove = owner.tenantId !== PLATFORM_TENANT_ID;
  console.log(
    ownerNeedsMove
      ? `  -> will set the owner's tenant to "${PLATFORM_TENANT_ID}" (role untouched)`
      : "  -> already on the Platform tenant; nothing to do",
  );

  const singleton = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { id: true, tenantId: true },
  });
  if (!singleton) {
    console.log('AppSetting "singleton": MISSING — nothing to stamp.');
  } else {
    console.log(`AppSetting "singleton": tenant=${singleton.tenantId ?? "null"}`);
    if (singleton.tenantId && singleton.tenantId !== PLATFORM_TENANT_ID) {
      console.error(
        `  REFUSING: the singleton row already belongs to tenant ${singleton.tenantId}.\n` +
          "  Re-stamping it would hand another tenant's settings to the platform.",
      );
      process.exit(1);
    }
    console.log(
      singleton.tenantId === PLATFORM_TENANT_ID
        ? "  -> already owned by the Platform tenant; nothing to do"
        : `  -> will stamp tenantId = "${PLATFORM_TENANT_ID}". The row's CONTENTS are untouched and` +
            " it stays reachable by its id, so every existing settings read keeps working.",
    );
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --platform --apply to perform it.");
    return;
  }

  const manifest: Manifest = {
    createdAt: new Date().toISOString(),
    step: "platform",
    tenantId: platform.id,
    tenantSlug: platform.slug,
    moved: {},
    settingsCopied: [],
    platformUndo: {
      ownerUserId: owner.id,
      ownerPreviousTenantId: owner.tenantId,
      singletonSettingId: singleton?.id ?? null,
      singletonPreviousTenantId: singleton?.tenantId ?? null,
    },
  };

  await prisma.$transaction(
    async (tx) => {
      if (ownerNeedsMove) {
        // Writes tenantId ONLY. The owner-protection extension in lib/db/prisma allows
        // this now that it guards the role rather than the tenant; it still refuses any
        // payload that would take this account below SUPER_ADMIN, which is why `role` is
        // deliberately absent here instead of being re-asserted.
        await tx.user.update({ where: { id: owner.id }, data: { tenantId: PLATFORM_TENANT_ID } });
      }
      if (singleton && singleton.tenantId !== PLATFORM_TENANT_ID) {
        await tx.appSetting.update({
          where: { id: singleton.id },
          data: { tenantId: PLATFORM_TENANT_ID },
        });
      }
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  const out = writeManifest(manifest, "platform");
  console.log("\nDone. The owner and the platform settings now belong to the Platform tenant.");
  console.log("SIGN OUT AND SIGN BACK IN, then confirm /admin still loads before step 2.");
  console.log(`Manifest: ${out}`);
  console.log(`Undo with: npm run rehome -- --revert ${out}`);
}

// ---------------------------------------------------------------------------
// Step 2 — the funnel half, behind a preflight
// ---------------------------------------------------------------------------

interface Preflight {
  blockers: string[];
  warnings: string[];
}

/**
 * Everything that must be true before funnel rows may change owner. Returns the reasons
 * it must not proceed rather than printing and exiting, so one dry run shows the whole
 * list instead of revealing one problem per attempt.
 */
function preflightConfig(
  tenantSlug: string,
  effectivePlan: string,
  singleton: object | null,
  target: object | null,
): Preflight {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Plan. Only GROWTH and SCALE carry `capi`; FREE also caps responses at 25/month and
  // disables the qualification gate, conditional routing, heatmap and API tokens.
  if (effectivePlan === "FREE" || effectivePlan === "STARTER") {
    blockers.push(
      `plan is ${effectivePlan}, which has capi=false. Moving the funnel here stops Meta CAPI, ` +
        "locks responses past the monthly cap, and disables the qualification gate, conditional " +
        "routing, heatmap and API tokens.\n" +
        `      Fix:  UPDATE tenant SET plan = 'SCALE' WHERE slug = '${tenantSlug}';`,
    );
  }

  // Integration config. A value that exists ONLY in an environment variable is the
  // dangerous case: env covers the platform scope and not a business tenant, so the move
  // itself is what switches the feature off. That reads afterwards as "it worked before
  // the move", which is exactly why this blocks instead of warning.
  for (const c of CRITICAL) {
    if (!isBlank(field(target, c.field)) || !isBlank(field(singleton, c.field))) continue;
    blockers.push(
      !isBlank(process.env[c.env])
        ? `${c.field} is blank in Settings on BOTH rows and lives only in ${c.env}. Env covers the ` +
            `platform scope only, so ${c.what} STOPS the moment these rows belong to a tenant.\n` +
            "      Fix:  npm run settings:from-env   (writes env values into Settings), then re-run."
        : `${c.field} is blank everywhere — ${c.what} is already unconfigured and would stay that ` +
            "way.\n      Fix:  enter it in Settings for this workspace, then re-run.",
    );
  }

  // 🟡 A platform dataset override does not survive the move: a tenant uses its pixel id
  // as the dataset and has no equivalent override, so CAPI can change destination.
  const datasetOverride = process.env.META_DATASET_ID;
  const pixel = field(target, "metaPixelId") ?? field(singleton, "metaPixelId");
  if (datasetOverride && pixel && datasetOverride !== pixel) {
    warnings.push(
      `META_DATASET_ID (${datasetOverride}) differs from the pixel id (${String(pixel)}). The ` +
        "platform sends CAPI to the dataset; a tenant sends it to its pixel id. After the move, " +
        `events go to ${String(pixel)} instead of ${datasetOverride}. Confirm that is intended.`,
    );
  }
  return { blockers, warnings };
}

async function tenantStep(slug: string, apply: boolean) {
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
  if (tenant.id === PLATFORM_TENANT_ID) {
    console.error(
      "The funnel does not move to the Platform tenant. The platform runs the SaaS; the funnel is a\n" +
        "business of its own. Use --platform for the owner/settings half, and name the funnel's own\n" +
        "tenant here (e.g. --tenant apply-gita).",
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

  const billing = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { plan: true, subscription: { select: { plan: true, status: true } } },
  });
  const effectivePlan = String(billing?.subscription?.plan ?? billing?.plan ?? "FREE");
  console.log(
    `Plan: ${effectivePlan}` +
      (billing?.subscription
        ? ` (subscription ${billing.subscription.status})`
        : " (no subscription)"),
  );

  // BEFORE counts, per table, for BOTH the source (null) and the destination. Printed as
  // a pair so the after-counts can be checked arithmetically rather than by "the
  // destination has some rows now" — which passes even when a whole table was skipped.
  console.log("\nPer-table counts (null = moves, tenant = already owned):");
  const before: Record<string, { nul: number; own: number }> = {};
  let total = 0;
  for (const name of TABLES) {
    const nul = await delegate(prisma, name).count({ where: { tenantId: null } });
    const own = await delegate(prisma, name).count({ where: { tenantId: tenant.id } });
    before[name] = { nul, own };
    total += nul;
    console.log(`  ${name.padEnd(22)} null=${String(nul).padEnd(8)} ${tenant.slug}=${own}`);
  }
  console.log(`  ${"TOTAL TO MOVE".padEnd(22)} ${total}`);

  const singleton = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  const target = await prisma.appSetting.findUnique({ where: { tenantId: tenant.id } });
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
  }

  const { blockers, warnings } = preflightConfig(tenant.slug, effectivePlan, singleton, target);
  // The settings copy runs inside the same transaction as the move, so a value the copy
  // WILL supply is not really a blocker. Drop those before deciding.
  const remaining = blockers.filter((b) => {
    const c = CRITICAL.find((x) => b.startsWith(x.field));
    return !c || !toCopy.includes(c.field);
  });

  if (warnings.length > 0) {
    console.log("\n🟡 Warnings (not blocking — confirm these are intended):");
    for (const w of warnings) console.log(`  - ${w}`);
  }
  if (remaining.length > 0) {
    console.log("\n🔴 Preflight FAILED — the move would break the funnel:");
    for (const b of remaining) console.log(`  - ${b}`);
  } else {
    console.log("\n🟢 Preflight passed: the plan carries CAPI and every critical value is present.");
  }

  if (!apply) {
    console.log(
      remaining.length > 0
        ? "\nDry run complete. Fix the blockers above, then re-run."
        : "\nDry run complete. Re-run with --apply to perform the move.",
    );
    return;
  }
  if (remaining.length > 0 && !process.argv.includes("--allow-dark-funnel")) {
    console.error(
      "\nRefusing to apply while the preflight fails. This is the check that stops the funnel going\n" +
        "dark — a moved funnel with no pixel, no CAPI or no signable checkout looks completely fine\n" +
        "in the admin and silently stops earning.\n" +
        "If you have decided to accept that, re-run with --allow-dark-funnel.",
    );
    process.exit(1);
  }

  const manifest: Manifest = {
    createdAt: new Date().toISOString(),
    step: "tenant",
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
              id: tenantAppSettingId(tenant.id),
              tenantId: tenant.id,
            } as Prisma.AppSettingUncheckedCreateInput,
          });
        }
      }
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  // AFTER counts, checked arithmetically against BEFORE: every null row must have become
  // a tenant row, and nothing else may have changed. A table that was skipped shows up
  // here as a non-zero null count rather than as a quietly smaller total.
  console.log("\nVerification (expected: null=0, tenant = before.null + before.own):");
  let bad = 0;
  for (const name of TABLES) {
    const nul = await delegate(prisma, name).count({ where: { tenantId: null } });
    const own = await delegate(prisma, name).count({ where: { tenantId: tenant.id } });
    const b = before[name];
    // Every TABLES entry was recorded in the BEFORE loop above. If one is missing, the
    // reconciliation is meaningless — throw rather than default to 0, which would make a
    // table that was never counted look like it balanced perfectly.
    if (!b) throw new Error(`No before-count recorded for ${name} — cannot verify the move.`);
    const expect = b.nul + b.own;
    const ok = nul === 0 && own === expect;
    if (!ok) bad++;
    console.log(
      `  ${ok ? "🟢" : "🔴"} ${name.padEnd(22)}` +
        ` moved=${String(manifest.moved[name]?.length ?? 0).padEnd(8)}` +
        `null=${String(nul).padEnd(6)} ${tenant.slug}=${own} (expected ${expect})`,
    );
  }
  console.log(`  AppSetting fields copied: ${toCopy.length}`);

  const out = writeManifest(manifest, tenant.slug);
  console.log(
    bad === 0
      ? "\n🟢 Every table reconciles."
      : `\n🔴 ${bad} table(s) do NOT reconcile — investigate before trusting this move.`,
  );
  console.log(`Manifest: ${out}`);
  console.log(`Undo with: npm run rehome -- --revert ${out}`);
}

// ---------------------------------------------------------------------------
// Revert — exact, from a manifest
// ---------------------------------------------------------------------------

async function revert(path: string) {
  const m = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  console.log(
    `Reverting ${m.step ?? "tenant"} manifest from ${m.createdAt} (tenant ${m.tenantSlug})`,
  );

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
      // Put the owner and the platform settings row back exactly as they were, from the
      // recorded previous values rather than assuming both were null.
      const u = m.platformUndo;
      if (u?.ownerUserId) {
        await tx.user.update({
          where: { id: u.ownerUserId },
          data: { tenantId: u.ownerPreviousTenantId },
        });
        out["user (owner)"] = 1;
      }
      if (u?.singletonSettingId) {
        await tx.appSetting.update({
          where: { id: u.singletonSettingId },
          data: { tenantId: u.singletonPreviousTenantId },
        });
        out["appSetting (singleton)"] = 1;
      }
      return out;
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v} restored`);
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

  const apply = process.argv.includes("--apply");
  if (process.argv.includes("--platform")) return platformStep(apply);

  const slug = arg("--tenant");
  if (!slug) {
    console.error("Usage: npm run rehome -- --platform [--apply]        # owner + platform settings");
    console.error("       npm run rehome -- --tenant <slug> [--apply]   # the funnel data");
    console.error("       npm run rehome -- --revert <manifest.json>");
    process.exit(1);
  }
  return tenantStep(slug, apply);
}

main()
  .catch((e) => {
    console.error("rehome failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
