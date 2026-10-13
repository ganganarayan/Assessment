/**
 * Pre-flight: what does this funnel actually resolve, and is it safe to drive?
 *
 * A browser run writes real rows and fires whatever the funnel is wired to fire. On
 * staging today that is nothing outbound, but "today" is the whole problem: the moment
 * a pixel or a CAPI token lands on the tenant, a thirty-case sweep would teach Meta
 * that thirty people converted. So this is checked at run time against the database,
 * never assumed, and a live integration stops the run rather than warning about it.
 *
 * The resolution order mirrors resolveMetaConfig in src/lib/settings/config.ts: the
 * assessment's named ad account, else the tenant's default account, else the legacy
 * AppSetting columns, and platform scope reads the platform pixel instead. It is
 * deliberately COARSE - it answers "is anything live" rather than "which pixel" -
 * because the only decision it feeds is whether to run at all.
 */
import { db } from "./db.js";
import { isPlatformScope } from "../../src/lib/tenant/platform-tenant.js";
import type { Funnel } from "./config/read.js";

export interface GuardFinding {
  level: "block" | "warn" | "ok";
  what: string;
  detail: string;
}

export interface GuardReport {
  findings: GuardFinding[];
  blocked: boolean;
}

const set = (v: string | null | undefined): boolean => typeof v === "string" && v.trim().length > 0;

export async function preflight(
  funnel: Funnel,
  opts: { allowLiveIntegrations: boolean; isProdHost: boolean; allowProd: boolean },
): Promise<GuardReport> {
  const f: GuardFinding[] = [];
  const row = funnel.row;
  const tenantId = row.tenantId;

  if (opts.isProdHost && !opts.allowProd) {
    f.push({
      level: "block",
      what: "target host",
      detail: "The base URL does not look like staging. A run writes real submissions, so pass --i-know-this-is-prod to override.",
    });
  }

  // --- Meta -----------------------------------------------------------------------
  let pixel: string | null = null;
  let capi: string | null = null;
  let source = "none";
  if (isPlatformScope(tenantId)) {
    const s = await db().appSetting.findFirst({
      where: { tenantId: null },
      select: { platformPixelId: true, platformCapiTokenEnc: true },
    });
    pixel = s?.platformPixelId ?? null;
    capi = s?.platformCapiTokenEnc ?? null;
    source = "platform settings";
  } else if (tenantId) {
    const acct = row.adAccountId
      ? await db().adAccount.findFirst({
          where: { id: row.adAccountId, tenantId },
          select: { pixelId: true, capiTokenEnc: true },
        })
      : await db().adAccount.findFirst({
          where: { tenantId, isDefault: true },
          select: { pixelId: true, capiTokenEnc: true },
        });
    if (acct) {
      pixel = acct.pixelId;
      capi = acct.capiTokenEnc;
      source = row.adAccountId ? "the funnel's ad account" : "the tenant's default ad account";
    } else if (!row.adAccountId) {
      const s = await db().appSetting.findFirst({
        where: { tenantId },
        select: { metaPixelId: true, metaCapiTokenEnc: true },
      });
      pixel = s?.metaPixelId ?? null;
      capi = s?.metaCapiTokenEnc ?? null;
      source = "legacy tenant settings";
    }
  }

  if (set(pixel) || set(capi)) {
    f.push({
      level: opts.allowLiveIntegrations ? "warn" : "block",
      what: "Meta",
      detail: `${source} resolves ${set(pixel) ? "a pixel" : "no pixel"} and ${set(capi) ? "a CAPI token" : "no CAPI token"}. A sweep would report every case to Meta. Pass --force-live to run anyway.`,
    });
  } else {
    f.push({ level: "ok", what: "Meta", detail: `nothing configured (${source}), so the funnel reports nowhere` });
  }

  // --- Payments -------------------------------------------------------------------
  if (row.paidMode) {
    const s = await db().appSetting.findFirst({
      where: { tenantId: isPlatformScope(tenantId) ? null : tenantId },
      select: { razorpayKeyId: true, paymentsEnabledGlobal: true },
    });
    const key = s?.razorpayKeyId ?? "";
    const isTest = key.startsWith("rzp_test");
    f.push({
      level: isTest ? "warn" : opts.allowLiveIntegrations ? "warn" : "block",
      what: "payments",
      detail: isTest
        ? "paid funnel on a rzp_test key, so checkouts are test-mode"
        : `paid funnel and the Razorpay key is ${key ? "not a test key" : "missing"}. Pass --force-live to run anyway.`,
    });
  }

  // --- AI, email, outbound --------------------------------------------------------
  const platform = await db().appSetting.findFirst({
    where: { tenantId: null },
    select: { aiEnabled: true, smtpHost: true, crmDripActive: true, crmCustomActive: true, nurtureConfig: true, wabaEnabledGlobal: true },
  });
  if (row.useAiStatement && platform?.aiEnabled) {
    f.push({ level: "warn", what: "AI", detail: "every completion makes a real provider call, so a sweep costs one call per case" });
  }
  if (set(platform?.smtpHost)) {
    f.push({ level: "warn", what: "email", detail: "SMTP is configured, so paths that send mail really send. Test identities use the QA_EMAIL_DOMAIN." });
  }
  if (platform?.crmDripActive || platform?.crmCustomActive) {
    f.push({ level: "warn", what: "CRM drip", detail: "a drip is active, so completions queue CRM sends" });
  }
  if (platform?.wabaEnabledGlobal) {
    f.push({ level: "warn", what: "WhatsApp", detail: "WABA is enabled globally, so opt-in paths may message the number supplied" });
  }

  const hooks = await db().webhook.count({
    where: { tenantId: isPlatformScope(tenantId) ? null : tenantId, status: "ACTIVE" },
  });
  if (hooks > 0) {
    f.push({ level: "warn", what: "webhooks", detail: `${hooks} active webhook(s) will receive every completion` });
  }

  return { findings: f, blocked: f.some((x) => x.level === "block") };
}

export function renderGuard(r: GuardReport): string {
  const dot = (l: GuardFinding["level"]) => (l === "block" ? "BLOCK" : l === "warn" ? "warn " : "ok   ");
  return r.findings.map((x) => `  [${dot(x.level)}] ${x.what}: ${x.detail}`).join("\n");
}
