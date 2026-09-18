import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db/prisma";
import { resolveSmtpConfig, resolveWabaConfig, resolveNurtureConfig } from "@/lib/settings/config";
import { fillPlaceholders, toE164Digits, type LeadFields, type NurtureConfig } from "@/features/nurture/config";

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

/** Send one email through the tenant's SMTP. Returns an error string, or null on success. */
export async function sendEmail(
  tenantId: string | null,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<string | null> {
  const smtp = await resolveSmtpConfig(tenantId);
  if (!smtp.host || !smtp.port || !smtp.fromEmail) return "SMTP is not configured.";
  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
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

  // Email
  if (cfg.email.enabled) {
    const to = (s.leadEmail ?? "").trim();
    if (!to) {
      await log(s.tenantId, s.id, "EMAIL", "SKIPPED", null, "No lead email.");
    } else {
      const err = await sendEmail(
        s.tenantId,
        to,
        fillPlaceholders(cfg.email.subject, lead),
        fillPlaceholders(cfg.email.body, lead),
      );
      await log(s.tenantId, s.id, "EMAIL", err ? "FAILED" : "SENT", to, err ?? undefined);
    }
  }

  // WhatsApp
  if (cfg.waba.enabled) {
    const waba = await resolveWabaConfig(s.tenantId);
    const digits = toE164Digits(s.leadMobile, waba.defaultCountryCode);
    if (!digits) {
      await log(s.tenantId, s.id, "WABA", "SKIPPED", s.leadMobile ?? null, "No/invalid mobile.");
    } else {
      const vars = cfg.waba.vars.map((v) => fillPlaceholders(v, lead));
      const err = await sendWaba(s.tenantId, digits, cfg.waba.template, cfg.waba.lang, vars);
      await log(s.tenantId, s.id, "WABA", err ? "FAILED" : "SENT", digits, err ?? undefined);
    }
  }
}
