/**
 * Show exactly what a tenant's workspace will contain AFTER the re-home — before
 * anything is written.
 *
 *   npx tsx scripts/preview-rehome.ts --tenant apply-gita
 *   npx tsx scripts/preview-rehome.ts --tenant apply-gita --samples 10
 *
 * Prefix with `railway run` (add `--environment production` for prod), from the repo
 * root — `railway run` executes in the current directory.
 *
 * STRICTLY READ-ONLY. It opens no transaction and issues no write of any kind, so it is
 * safe against production at any time and can be run as often as you like.
 *
 * WHY THIS EXISTS
 * The re-home does not copy or delete anything: every row keeps its id and its contents,
 * and the step sets the `tenantId` column that is currently NULL. Because the rows are
 * only visible under super-admin until that column is set, there is no way to LOOK at
 * the workspace you are about to create — you would have to perform the move to see it.
 * This closes that gap: same counts, same sample rows, same settings decisions the mover
 * will make, with nothing written. Inspect here, then apply.
 *
 * It answers three questions:
 *   1. What data lands in the workspace?           (per table, with sample rows)
 *   2. Which settings come with it, and which do not?
 *   3. What will STILL read the platform row afterwards? — the honest gap, and the part
 *      that is easy to miss, because those values copy across and then sit unread.
 */
import "./public-db-url";
import { prisma } from "../src/lib/db/prisma";
import { resolvePlan } from "../src/lib/billing/plan-resolve";

/** Kept in step with TABLES in rehome-platform-data.ts — the tables the move covers. */
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

interface CountOnly {
  count(args?: { where: { tenantId: string | null } }): Promise<number>;
}

function delegate(name: TableName): CountOnly {
  return (prisma as unknown as Record<TableName, CountOnly>)[name];
}

/** Kept in step with SETTINGS_SKIP in rehome-platform-data.ts, with the reason for each. */
const SKIPPED: { field: string; why: string }[] = [
  { field: "platformPixelId", why: "the Assess360 signup pixel, not the funnel's" },
  { field: "platformCapiTokenEnc", why: "same — platform CAPI, not the funnel's" },
  { field: "landingVideos", why: "the marketing site, which is the SaaS shopfront" },
  { field: "r2AccountId", why: "one bucket app-wide; read from the platform row only" },
  { field: "r2AccessKeyId", why: "same" },
  { field: "r2SecretAccessKeyEnc", why: "same" },
  { field: "r2BucketName", why: "same" },
  { field: "r2PublicUrl", why: "same" },
];
const SKIP_SET = new Set([...SKIPPED.map((s) => s.field), "id", "tenantId", "createdAt", "updatedAt"]);

/**
 * Code paths that read `appSetting` by `id: "singleton"` — the PLATFORM row — rather
 * than by the acting tenant. These do not follow the move: the matching fields are
 * copied onto the tenant row and then nothing reads them, so changing them in the
 * workspace has no effect until the reader is made scope-aware.
 *
 * This is a maintained list, not something derived at runtime. To re-audit:
 *   grep -rn 'id: "singleton"' src/lib src/features
 */
const SINGLETON_READERS: { what: string; where: string; effect: string }[] = [
  {
    what: "Legal entity, address, contact email, governing location",
    where: "src/lib/legal/config.ts",
    effect: "the public legal pages always show the PLATFORM's entity, never the tenant's",
  },
  {
    what: "Abandoned-submission sweep (abandonedAfterHours)",
    where: "src/lib/events/abandoned.ts",
    effect: "the cron sweeps every tenant on the platform's threshold",
  },
  {
    what: "CRM drip + custom send (crm* — 15 fields)",
    where: "src/lib/crm/drip.ts, src/lib/crm/send.ts",
    effect: "singleton-only by decision; the copied values are inert until per-tenant CRM exists",
  },
  {
    what: "Password-reset webhook URL",
    where: "src/lib/auth/auth.ts",
    effect: "reset mail is sent through the platform's webhook for every tenant",
  },
  {
    what: "Purchase auto-fire amounts / high-ticket threshold + event name",
    where: "src/lib/meta/capi-log.ts",
    effect: "purchase banding is platform-wide, so the tenant's copies are unread",
  },
  {
    what: "Support email shown when a plan gate blocks something",
    where: "src/lib/billing/gate.ts",
    effect: "the platform's support address is shown, not the tenant's",
  },
  {
    what: "R2 object storage credentials",
    where: "src/lib/storage/r2.ts",
    effect: "by design — one bucket, partitioned by `tenants/<id>/` key prefix",
  },
];

/** Settings UI that exists on /admin but has no card on /w, so the tenant cannot edit it. */
const UI_GAPS: { what: string; where: string }[] = [
  {
    what: "Legal settings (entity name, address, contact email, governing location)",
    where: "LegalSettingsForm renders on /admin/settings only",
  },
];

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/** Enough of an email to recognise a row, not enough to harvest one out of a log. */
function maskEmail(v: string | null): string {
  if (!v) return "—";
  const at = v.indexOf("@");
  if (at < 1) return "***";
  return `${v.slice(0, 2)}***${v.slice(at)}`;
}

function heading(s: string) {
  console.log(`\n${s}`);
  console.log("─".repeat(s.length));
}

async function main() {
  const slug = arg("--tenant");
  if (!slug) {
    console.error("Usage: npx tsx scripts/preview-rehome.ts --tenant <slug> [--samples N]");
    process.exit(1);
  }
  const sampleCount = Math.max(0, Math.min(50, Number(arg("--samples") ?? 5)));

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    console.error(`No tenant with slug "${slug}".`);
    process.exit(1);
  }

  console.log(`PREVIEW — nothing is written. Tenant: ${tenant.name} (${tenant.slug}) ${tenant.id}`);
  const plan = await resolvePlan(tenant.id);
  console.log(
    `Plan: ${plan.unlimited ? "unlimited (internal)" : String(plan.plan)}` +
      `${plan.status ? ` (subscription ${plan.status})` : ""}`,
  );

  // ---------------------------------------------------------------- 1. the data
  heading("1. Rows the workspace will contain");
  console.log("   moving = currently unowned (tenantId NULL) · already = this tenant owns it now");
  console.log("   Row ids and contents are unchanged by the move; only the owner column is set.\n");
  console.log(`   ${"table".padEnd(22)} ${"moving".padStart(8)} ${"already".padStart(8)} ${"after".padStart(8)}`);
  let movingTotal = 0;
  let afterTotal = 0;
  for (const name of TABLES) {
    const moving = await delegate(name).count({ where: { tenantId: null } });
    const already = await delegate(name).count({ where: { tenantId: tenant.id } });
    movingTotal += moving;
    afterTotal += moving + already;
    console.log(
      `   ${name.padEnd(22)} ${String(moving).padStart(8)} ${String(already).padStart(8)} ${String(moving + already).padStart(8)}`,
    );
  }
  console.log(`   ${"TOTAL".padEnd(22)} ${String(movingTotal).padStart(8)} ${"".padStart(8)} ${String(afterTotal).padStart(8)}`);

  // ------------------------------------------------------------- 2. sample rows
  if (sampleCount > 0) {
    heading(`2. Sample rows (first ${sampleCount} of each, newest first)`);

    const assessments = await prisma.assessment.findMany({
      where: { tenantId: null },
      select: { slug: true, title: true, status: true, engine: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: sampleCount,
    });
    console.log(`\n   assessment (${assessments.length} shown)`);
    for (const a of assessments) {
      console.log(
        `     ${a.createdAt.toISOString().slice(0, 10)}  ${String(a.status).padEnd(9)} ${String(a.engine).padEnd(13)} ${a.slug}  —  ${a.title}`,
      );
    }

    const submissions = await prisma.submission.findMany({
      where: { tenantId: null },
      select: {
        identifierValue: true,
        status: true,
        totalScore: true,
        createdAt: true,
        assessment: { select: { slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: sampleCount,
    });
    console.log(`\n   submission (${submissions.length} shown; identifier masked)`);
    for (const s of submissions) {
      console.log(
        `     ${s.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${String(s.status).padEnd(10)}` +
          ` score=${String(s.totalScore ?? "—").padEnd(6)} ${String(s.assessment?.slug ?? "—").padEnd(22)} ${maskEmail(s.identifierValue)}`,
      );
    }

    const webhooks = await prisma.webhook.findMany({
      where: { tenantId: null },
      select: { name: true, url: true, status: true, eventType: true },
      take: sampleCount,
    });
    console.log(`\n   webhook (${webhooks.length} shown)`);
    for (const w of webhooks) {
      const host = (() => {
        try {
          return new URL(w.url).host;
        } catch {
          return w.url.slice(0, 40);
        }
      })();
      console.log(
        `     ${String(w.status).padEnd(8)} ${String(w.eventType).padEnd(22)} ${String(w.name).padEnd(28)} ${host}`,
      );
    }
  }

  // ------------------------------------------------------------- 3. the settings
  heading("3. Settings");
  const singleton = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  const target = await prisma.appSetting.findUnique({ where: { tenantId: tenant.id } });
  console.log(`   Tenant settings row: ${target ? "exists" : "MISSING — the move creates it"}`);

  if (!singleton) {
    console.log("   🟡 No platform settings row, so nothing would be copied.");
  } else {
    const copy: string[] = [];
    const kept: string[] = [];
    for (const [k, v] of Object.entries(singleton)) {
      if (SKIP_SET.has(k) || isBlank(v)) continue;
      const cur = target ? (target as unknown as Record<string, unknown>)[k] : null;
      if (isBlank(cur)) copy.push(k);
      else if (cur !== v) kept.push(k);
    }
    console.log(`\n   🟢 Copied from the platform row (${copy.length}):`);
    console.log(`      ${copy.join(", ") || "(none)"}`);
    if (kept.length > 0) {
      console.log(`\n   🟢 Tenant already has its own value, left alone (${kept.length}):`);
      console.log(`      ${kept.join(", ")}`);
    }
    console.log(`\n   🟡 Deliberately NOT copied (${SKIPPED.length}):`);
    for (const s of SKIPPED) console.log(`      ${s.field.padEnd(24)} ${s.why}`);
  }

  // --------------------------------------------- 4. what the move does NOT give you
  heading("4. 🟡 What will STILL read the platform row afterwards");
  console.log("   These fields are copied onto the tenant row and then nothing reads them.");
  console.log("   Editing them in the workspace will have no effect until the reader is");
  console.log("   made scope-aware. This is the gap between the move and a true replica.\n");
  for (const r of SINGLETON_READERS) {
    console.log(`   • ${r.what}`);
    console.log(`     ${r.where}`);
    console.log(`     → ${r.effect}\n`);
  }

  heading("5. 🟡 Settings with no workspace UI");
  for (const g of UI_GAPS) {
    console.log(`   • ${g.what}`);
    console.log(`     ${g.where}\n`);
  }

  console.log("Preview complete — nothing was written.");
  console.log(`Next: npx tsx scripts/rehome-platform-data.ts --tenant ${tenant.slug}    (dry run)`);
}

main()
  .catch((e) => {
    console.error("preview-rehome failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
