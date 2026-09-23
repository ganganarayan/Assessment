import "server-only";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { resolveSmtpConfig, resolveWabaConfig, resolveNurtureConfig, type SmtpConfig } from "@/lib/settings/config";
import { fillPlaceholders, toE164Digits, type LeadFields, type NurtureConfig } from "@/features/nurture/config";
import { pickResultUrl, vidapulseParamForTenant } from "@/lib/events/completion";
import { instrumentEmailLinks } from "@/lib/nurture/tracking";

/**
 * Nurture sender — one-shot Email (SMTP) + WhatsApp (Meta Cloud API) fired on opt-in.
 * Best-effort: every attempt is logged to NurtureLog (SENT/FAILED/SKIPPED) and a
 * failure never throws to the caller (the opt-in must not break because a mail server
 * is down). No automatic retry — an operator resends from the Nurture page.
 */

type Channel = "EMAIL" | "WABA";

async function log(
  tenantId: string | null,
  submissionId: string | null,
  channel: Channel,
  status: "SENT" | "FAILED" | "SKIPPED",
  toAddress: string | null,
  error?: string,
) {
  await prisma.nurtureLog
    .create({ data: { tenantId, submissionId, channel, status, toAddress, error: error?.slice(0, 500) ?? null } })
    .catch(() => {});
}

/**
 * Send a nurture email with click tracking, and log the attempt in ONE step.
 * The log id is generated up front so it can be baked into the rewritten links,
 * then the row is written with that same id. Returns the send error, or null.
 */
export async function sendTrackedEmail(
  tenantId: string | null,
  submissionId: string | null,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<string | null> {
  const logId = randomUUID();
  const html = instrumentEmailLinks(htmlBody, logId, env.NEXT_PUBLIC_APP_URL);
  const err = await sendEmail(tenantId, to, subject, html);
  await prisma.nurtureLog
    .create({
      data: {
        id: logId,
        tenantId,
        submissionId,
        channel: "EMAIL",
        status: err ? "FAILED" : "SENT",
        toAddress: to,
        error: err?.slice(0, 500) ?? null,
      },
    })
    .catch(() => {});
  return err;
}

/** Send one email through the tenant's SMTP. Returns an error string, or null on success. */
export async function sendEmail(
  tenantId: string | null,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<string | null> {
  const smtp = await resolveSmtpConfig(tenantId);
  if (!smtp.host || !smtp.port || !smtp.fromEmail) return "SMTP is not configured.";

  // ZeptoMail: PaaS hosts (Railway) often block outbound SMTP ports, which shows
  // up as "Connection timeout". Send via ZeptoMail's HTTPS API (port 443, never
  // blocked) instead — same Send-Mail token as the SMTP password.
  if (/(^|\.)zeptomail\./i.test(smtp.host)) {
    return sendViaZeptoMailApi(smtp, to, subject, htmlBody);
  }

  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
      // Fail fast with a clear error instead of hanging for ~2 minutes.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      // On 587 (secure=false) enforce the STARTTLS upgrade.
      ...(smtp.secure ? {} : { requireTLS: true }),
    });
    await transport.sendMail({
      from: smtp.fromName ? `"${smtp.fromName}" <${smtp.fromEmail}>` : smtp.fromEmail,
      to,
      subject,
      html: htmlBody,
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Send via the ZeptoMail HTTPS API (bypasses blocked SMTP ports). The API key is
 *  the same "Send Mail" token stored as the SMTP password. Returns error or null. */
async function sendViaZeptoMailApi(
  smtp: SmtpConfig,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<string | null> {
  if (!smtp.host) return "SMTP host is not set.";
  if (!smtp.pass) return "ZeptoMail token (the SMTP password) is not set.";
  if (!smtp.fromEmail) return "From email is not set.";
  // smtp.zeptomail.in -> api.zeptomail.in (handles .in / .com); already-api hosts stay.
  const apiHost = smtp.host.replace(/^smtp\./i, "api.");
  const auth = /^zoho-enczapikey\s/i.test(smtp.pass) ? smtp.pass : `Zoho-enczapikey ${smtp.pass}`;
  try {
    const res = await fetch(`https://${apiHost}/v1.1/email`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        from: { address: smtp.fromEmail, ...(smtp.fromName ? { name: smtp.fromName } : {}) },
        to: [{ email_address: { address: to } }],
        subject,
        htmlbody: htmlBody,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) return null;
    const text = (await res.text()).slice(0, 400);
    return `ZeptoMail API ${res.status}: ${text}`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Send one WhatsApp template via the Meta Cloud API. Returns an error string, or null. */
export async function sendWaba(
  tenantId: string | null,
  toDigits: string,
  template: string,
  lang: string,
  bodyVars: string[],
): Promise<string | null> {
  const waba = await resolveWabaConfig(tenantId);
  if (!waba.phoneNumberId || !waba.accessToken) return "WhatsApp (WABA) is not configured.";
  if (!template.trim()) return "No WhatsApp template name set.";
  const components =
    bodyVars.length > 0
      ? [{ type: "body", parameters: bodyVars.map((t) => ({ type: "text", text: t })) }]
      : [];
  const payload = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: { name: template.trim(), language: { code: lang || "en" }, components },
  };
  try {
    const res = await fetch(`https://graph.facebook.com/${waba.apiVersion}/${waba.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${waba.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return `WhatsApp API ${res.status}: ${text.slice(0, 300)}`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function leadOf(s: {
  leadFirstName: string | null;
  leadLastName: string | null;
  leadEmail: string | null;
  leadMobile: string | null;
  leadProfession: string | null;
}): LeadFields {
  return {
    firstName: s.leadFirstName,
    lastName: s.leadLastName,
    email: s.leadEmail,
    mobile: s.leadMobile,
    profession: s.leadProfession,
  };
}

/**
 * Fire the Nurture email + WhatsApp for a submission. Guarded to run once per
 * submission (unless force). Safe to call fire-and-forget from the opt-in path.
 */
export async function sendNurtureForSubmission(submissionId: string, opts?: { force?: boolean }): Promise<void> {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      tenantId: true,
      nurtureSentAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      customerId: true,
      resultToken: true,
      status: true,
      assessment: {
        select: { slug: true, engine: true, nextStep: true, targetUrl: true },
      },
    },
  });
  if (!s) return;

  // Once-guard: atomically claim the send. updateMany with the null filter means only
  // the FIRST caller sets the stamp (count 1); a concurrent/duplicate opt-in gets 0 and
  // bails — so nurture never double-fires. `force` (manual resend) skips the guard.
  if (!opts?.force) {
    const claim = await prisma.submission.updateMany({
      where: { id: s.id, nurtureSentAt: null },
      data: { nurtureSentAt: new Date() },
    });
    if (claim.count === 0) return;
  } else {
    await prisma.submission.update({ where: { id: s.id }, data: { nurtureSentAt: new Date() } }).catch(() => {});
  }

  const cfg: NurtureConfig = await resolveNurtureConfig(s.tenantId);
  const lead = leadOf(s);

  // The person's own result URL ({{resultUrl}} in the draft). Only meaningful once
  // the assessment is completed; blank otherwise so a half-finished send has no link.
  let resultUrl: string | null = null;
  if (s.assessment && s.status === "COMPLETED") {
    const vidapulseParam = await vidapulseParamForTenant(s.tenantId);
    resultUrl = pickResultUrl({
      engine: s.assessment.engine,
      nextStep: s.assessment.nextStep,
      targetUrl: s.assessment.targetUrl,
      slug: s.assessment.slug,
      submissionId: s.id,
      token: s.resultToken,
      customerId: s.customerId,
      vidapulseParam,
    });
  }
  const extra = { resultUrl };

  // Email
  if (cfg.email.enabled) {
    const to = (s.leadEmail ?? "").trim();
    if (!to) {
      await log(s.tenantId, s.id, "EMAIL", "SKIPPED", null, "No lead email.");
    } else {
      // sendTrackedEmail rewrites links for click tracking AND writes the log row.
      await sendTrackedEmail(
        s.tenantId,
        s.id,
        to,
        fillPlaceholders(cfg.email.subject, lead, extra),
        fillPlaceholders(cfg.email.body, lead, extra),
      );
    }
  }

  // WhatsApp
  if (cfg.waba.enabled) {
    const waba = await resolveWabaConfig(s.tenantId);
    const digits = toE164Digits(s.leadMobile, waba.defaultCountryCode);
    if (!digits) {
      await log(s.tenantId, s.id, "WABA", "SKIPPED", s.leadMobile ?? null, "No/invalid mobile.");
    } else {
      const vars = cfg.waba.vars.map((v) => fillPlaceholders(v, lead, extra));
      const err = await sendWaba(s.tenantId, digits, cfg.waba.template, cfg.waba.lang, vars);
      await log(s.tenantId, s.id, "WABA", err ? "FAILED" : "SENT", digits, err ?? undefined);
    }
  }
}
