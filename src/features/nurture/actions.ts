"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { encryptWithSecret } from "@/lib/crypto";
import { resolveActingScope, tenantScope, scopeEditDenied } from "@/lib/tenant/acting";
import { tenantAppSettingId } from "@/lib/settings/tenant-row";
import { resolveWabaConfig } from "@/lib/settings/config";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { readNurtureConfig, fillPlaceholders, toE164Digits, type NurtureConfig } from "@/features/nurture/config";
import { sendEmail, sendWaba, sendTrackedEmail, sendNurtureForSubmission } from "@/lib/nurture/send";

/**
 * Nurture admin actions — connection settings (SMTP + WhatsApp), the message config,
 * test sends, manual resend and the send log. All follow the ACTING scope, so the
 * super-admin platform view edits the singleton row and impersonating a tenant edits
 * that tenant — the same as the Ads & payments settings. Secrets are encrypted and
 * never returned to the client.
 */

const enc = (v: string) => encryptWithSecret(v.trim(), env.BETTER_AUTH_SECRET);
function rowWhere(tenantId: string | null) {
  return tenantId ? { tenantId } : { id: "singleton" };
}
async function upsert(tenantId: string | null, data: Record<string, unknown>) {
  await prisma.appSetting.upsert({
    where: rowWhere(tenantId) as Prisma.AppSettingWhereUniqueInput,
    update: data,
    create: { id: tenantId ? tenantAppSettingId(tenantId) : "singleton", tenantId, ...data },
  });
}

export interface NurtureSettingsView {
  smtp: {
    host: string; port: number | null; secure: boolean; user: string;
    fromName: string; fromEmail: string; hasPass: boolean;
  };
  waba: { phoneNumberId: string; businessAccountId: string; apiVersion: string; defaultCountryCode: string; hasToken: boolean };
  config: NurtureConfig;
}

/** Current settings for the acting scope, with secrets masked to booleans. */
export async function getNurtureSettings(): Promise<NurtureSettingsView> {
  const scope = await resolveActingScope();
  const s = await prisma.appSetting.findUnique({
    where: rowWhere(scope.tenantId) as Prisma.AppSettingWhereUniqueInput,
    select: {
      smtpHost: true, smtpPort: true, smtpSecure: true, smtpUser: true, smtpPassEnc: true,
      smtpFromName: true, smtpFromEmail: true,
      wabaPhoneNumberId: true, wabaBusinessAccountId: true, wabaAccessTokenEnc: true, wabaApiVersion: true, wabaDefaultCountryCode: true,
      nurtureConfig: true,
    },
  });
  return {
    smtp: {
      host: s?.smtpHost ?? "", port: s?.smtpPort ?? null, secure: s?.smtpSecure ?? false,
      user: s?.smtpUser ?? "", fromName: s?.smtpFromName ?? "", fromEmail: s?.smtpFromEmail ?? "",
      hasPass: !!s?.smtpPassEnc,
    },
    waba: {
      phoneNumberId: s?.wabaPhoneNumberId ?? "", businessAccountId: s?.wabaBusinessAccountId ?? "",
      apiVersion: s?.wabaApiVersion ?? "",
      defaultCountryCode: s?.wabaDefaultCountryCode ?? "", hasToken: !!s?.wabaAccessTokenEnc,
    },
    config: readNurtureConfig(s?.nurtureConfig ?? null),
  };
}

export async function updateSmtpSettings(input: {
  host: string; port: string; secure: boolean; user: string; pass: string;
  fromName: string; fromEmail: string;
}): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const portNum = input.port.trim() ? Number(input.port) : null;
  if (portNum != null && (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535))
    return { ok: false, error: "Port must be a number between 1 and 65535." };
  await upsert(scope.tenantId, {
    smtpHost: input.host.trim() || null,
    smtpPort: portNum,
    smtpSecure: input.secure,
    smtpUser: input.user.trim() || null,
    smtpFromName: input.fromName.trim() || null,
    smtpFromEmail: input.fromEmail.trim() || null,
    // Only overwrite the password when a new one is typed (blank keeps the stored one).
    ...(input.pass.trim() ? { smtpPassEnc: enc(input.pass) } : {}),
  });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/nurture");
  return { ok: true };
}

/** Send a simple connectivity test email using the SAVED SMTP settings for the
 *  acting scope. Save the settings first, then test. */
export async function sendSmtpTest(to: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const dest = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
    return { ok: false, error: "Enter a valid email address to send the test to." };
  }
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111">
    <p style="font-size:16px">✅ Your SMTP settings are working.</p>
    <p>This is a test email from your Assessment app, sent to confirm the mail server configuration.
    If you received it, password-reset and nurture emails will send from here.</p>
  </div>`;
  const err = await sendEmail(scope.tenantId, dest, "SMTP test — your settings work", html);
  await prisma.nurtureLog
    .create({
      data: {
        tenantId: scope.tenantId,
        channel: "EMAIL",
        status: err ? "FAILED" : "SENT",
        toAddress: dest,
        error: err?.slice(0, 500) ?? null,
      },
    })
    .catch(() => {});
  return err ? { ok: false, error: err } : { ok: true };
}

export async function updateWabaSettings(input: {
  phoneNumberId: string; businessAccountId: string; accessToken: string; apiVersion: string; defaultCountryCode: string;
}): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  await upsert(scope.tenantId, {
    wabaPhoneNumberId: input.phoneNumberId.trim() || null,
    wabaBusinessAccountId: input.businessAccountId.trim() || null,
    wabaApiVersion: input.apiVersion.trim() || null,
    wabaDefaultCountryCode: input.defaultCountryCode.trim() || null,
    ...(input.accessToken.trim() ? { wabaAccessTokenEnc: enc(input.accessToken) } : {}),
  });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/nurture");
  return { ok: true };
}

export async function updateNurtureConfig(config: NurtureConfig): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const clean = readNurtureConfig(config);
  await upsert(scope.tenantId, { nurtureConfig: clean as unknown as Prisma.InputJsonValue });
  revalidatePath("/admin/nurture");
  return { ok: true };
}

/** Send the configured email to an arbitrary address, with a sample lead filled in. */
export async function sendTestEmail(to: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const dest = to.trim();
  if (!dest) return { ok: false, error: "Enter an email address to test." };
  const cfg = (await getNurtureSettings()).config;
  const sample = { firstName: "Test", lastName: "Lead", email: dest, mobile: "", profession: "Founder" };
  const sampleExtra = { resultUrl: `${env.NEXT_PUBLIC_APP_URL}/a/sample/r/sample-result` };
  const err = await sendTrackedEmail(
    scope.tenantId,
    null,
    dest,
    fillPlaceholders(cfg.email.subject || "Test email", sample, sampleExtra),
    fillPlaceholders(cfg.email.body || "<p>This is a test.</p>", sample, sampleExtra),
  );
  return err ? { ok: false, error: err } : { ok: true };
}

/** Send the configured WhatsApp template to an arbitrary number, sample lead filled. */
export async function sendTestWaba(to: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const cfg = (await getNurtureSettings()).config;
  const waba = await resolveWabaConfig(scope.tenantId);
  const digits = toE164Digits(to, waba.defaultCountryCode);
  if (!digits) return { ok: false, error: "Enter a valid mobile number to test." };
  if (!cfg.waba.template.trim()) return { ok: false, error: "Set the WhatsApp template name first." };
  const sample = { firstName: "Test", lastName: "Lead", email: "", mobile: to, profession: "Founder" };
  const sampleExtra = { resultUrl: `${env.NEXT_PUBLIC_APP_URL}/a/sample/r/sample-result` };
  const vars = cfg.waba.vars.map((v) => fillPlaceholders(v, sample, sampleExtra));
  const err = await sendWaba(scope.tenantId, digits, cfg.waba.template, cfg.waba.lang, vars);
  await prisma.nurtureLog.create({
    data: { tenantId: scope.tenantId, channel: "WABA", status: err ? "FAILED" : "SENT", toAddress: digits, error: err?.slice(0, 500) ?? null },
  }).catch(() => {});
  return err ? { ok: false, error: err } : { ok: true };
}

/** Re-fire nurture for one submission (bypasses the once-guard). Scoped. */
export async function resendNurture(submissionId: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const s = await prisma.submission.findFirst({
    where: { id: submissionId, ...tenantScope(scope) },
    select: { id: true },
  });
  if (!s) return { ok: false, error: "Submission not found." };
  await sendNurtureForSubmission(s.id, { force: true });
  revalidatePath("/admin/nurture");
  return { ok: true };
}

export interface NurtureLogRow {
  id: string; channel: string; status: string; toAddress: string | null;
  error: string | null; createdAt: string; clickedAt: string | null;
}

/** One approved WhatsApp template, shaped for the composer's picker. */
export interface WabaTemplateOption {
  name: string;
  language: string;
  category: string;
  bodyText: string; // BODY component text (with {{1}} placeholders)
  varCount: number; // number of body variables to map
}

// Minimal typing of the Graph message_templates response (no `any`).
interface GraphTemplateComponent {
  type?: string;
  text?: string;
}
interface GraphTemplate {
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: GraphTemplateComponent[];
}
interface GraphTemplatesResponse {
  data?: GraphTemplate[];
  error?: { message?: string };
}

/**
 * Pull the APPROVED WhatsApp message templates from the acting scope's Meta WABA
 * (GET /{wabaId}/message_templates). Needs the WhatsApp Business Account ID +
 * an access token with whatsapp_business_management. Read-only.
 */
export async function fetchWabaTemplates(): Promise<ActionResult<WabaTemplateOption[]>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const waba = await resolveWabaConfig(scope.tenantId);
  if (!waba.businessAccountId) {
    return { ok: false, error: "Add your WhatsApp Business Account ID in Settings → WhatsApp first." };
  }
  if (!waba.accessToken) {
    return { ok: false, error: "Add your WhatsApp access token in Settings first." };
  }
  const url = `https://graph.facebook.com/${waba.apiVersion}/${waba.businessAccountId}/message_templates?fields=name,language,status,category,components&limit=200`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${waba.accessToken}` },
      signal: AbortSignal.timeout(12_000),
    });
    const json = (await res.json().catch(() => null)) as GraphTemplatesResponse | null;
    if (!res.ok) {
      const m = json?.error?.message ?? `HTTP ${res.status}`;
      // A management-scope error is the common cause — nudge toward it.
      return { ok: false, error: `WhatsApp API: ${String(m).slice(0, 220)}` };
    }
    const rows = Array.isArray(json?.data) ? json!.data! : [];
    const out: WabaTemplateOption[] = rows
      // Only approved templates can actually be sent.
      .filter((t) => (t.status ?? "").toUpperCase() === "APPROVED" && typeof t.name === "string" && t.name)
      .map((t): WabaTemplateOption => {
        const body = (t.components ?? []).find((c) => c.type === "BODY");
        const bodyText = typeof body?.text === "string" ? body.text : "";
        return {
          name: t.name as string,
          language: typeof t.language === "string" ? t.language : "",
          category: typeof t.category === "string" ? t.category : "",
          bodyText,
          varCount: (bodyText.match(/\{\{\s*\d+\s*\}\}/g) ?? []).length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Recent send attempts for the acting scope. */
export async function getNurtureLogs(limit = 50): Promise<NurtureLogRow[]> {
  const scope = await resolveActingScope();
  const rows = await prisma.nurtureLog.findMany({
    where: tenantScope(scope),
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    select: { id: true, channel: true, status: true, toAddress: true, error: true, createdAt: true, clickedAt: true },
  });
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    clickedAt: r.clickedAt ? r.clickedAt.toISOString() : null,
  }));
}
