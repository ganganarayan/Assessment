import "server-only";

/**
 * Who actually carries the mail.
 *
 * 🔴 THE REASON THIS FILE EXISTS: Railway blocks outbound SMTP. Ports 25, 465 and 587
 * do not connect from inside the container, and the symptom is a connection timeout
 * about ten seconds after a save that reported success - which reads as a wrong
 * password, so people re-type credentials for an hour. Every provider worth offering
 * has an HTTPS API on 443, which is never blocked, so the product sends over HTTPS and
 * keeps SMTP only for the deployments that can use it.
 *
 * A provider is a row here, not a branch in the sender: id, what to call its key, where
 * the customer finds it, and one function. Adding the next one is an entry.
 *
 * 🟡 WHAT IS DELIBERATELY ABSENT. Gmail and Zoho Mail mailboxes. Neither has an
 * API-key HTTPS send; both need OAuth2, and Google's gmail.send scope is restricted and
 * reviewed. More to the point, a mailbox is the wrong tool: a gmail.com address cannot
 * be SPF or DKIM authenticated for a domain you own, so mail sent "from" it at volume
 * is filtered. A Zoho customer is already served - ZeptoMail IS Zoho's transactional
 * product, same login - and a Gmail customer wants a real sending domain, not their
 * inbox. Saying so in the UI is kinder than offering a choice that silently lands in
 * spam.
 */

import { DEFAULT_PROVIDER_ID, EMAIL_PROVIDER_OPTIONS } from "@/lib/email/catalog";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName: string | null;
  replyTo?: string | null;
}

/**
 * Everything a provider might need. HTTPS providers read `apiKey` and ignore the rest;
 * the SMTP entry is the only one that reads host, port, secure, user and pass.
 */
export interface EmailCredentials {
  apiKey: string | null;
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  pass: string | null;
}

/**
 * The half of a provider that touches the wire. Its labels and hints live in the
 * catalog, which the browser is allowed to read; nothing here ever is.
 */
export interface EmailProvider {
  id: string;
  /** Returns an error string the owner can act on, or null on success. */
  send(cred: EmailCredentials, msg: EmailMessage): Promise<string | null>;
}

/**
 * Every HTTPS call gets the same ceiling. A send is on a queue; it may fail, it may not
 * hang, because the heartbeat behind it is a chain and one stuck socket is everybody
 * else's delay.
 */
const TIMEOUT_MS = 12_000;

function fromHeader(msg: EmailMessage): string {
  return msg.fromName ? `${msg.fromName} <${msg.fromEmail}>` : msg.fromEmail;
}

/**
 * One shape of failure for every provider.
 *
 * The body is included, trimmed, because providers put the actionable part there and
 * nowhere else: an unverified sending domain, a key from the wrong region, a sandbox
 * account that may only mail its own owner. A bare "401" sends somebody hunting for a
 * typo in a key that is perfectly good.
 */
async function failure(label: string, res: Response): Promise<string> {
  let body: string;
  try {
    body = (await res.text()).slice(0, 400);
  } catch {
    body = "(no response body)";
  }
  return `${label} ${res.status}: ${body}`;
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Guard every HTTPS provider the same way, so a missing key never reaches the wire. */
function needKey(cred: EmailCredentials, msg: EmailMessage, what: string): string | null {
  if (!cred.apiKey) return `${what} is not set.`;
  if (!msg.fromEmail) return "From email is not set.";
  return null;
}

/**
 * ZeptoMail, in two entries rather than one with a guess.
 *
 * 🔴 The region is part of the account and CANNOT be inferred: a token issued on
 * zeptomail.com answers api.zeptomail.in with a 401 that is indistinguishable from a
 * wrong key, and that is a genuinely horrible hour to spend. Two rows, the owner picks,
 * nothing is guessed.
 */
function zeptomail(host: string, id: string): EmailProvider {
  return {
    id,
    async send(cred, msg) {
      const bad = needKey(cred, msg, "ZeptoMail Send Mail token");
      if (bad) return bad;
      // The token is stored as the customer pasted it. Both forms are common in the
      // console and in other people's docs, so accept either rather than making the
      // prefix a rule nobody told them about.
      const key = cred.apiKey as string;
      const auth = /^zoho-enczapikey\s/i.test(key) ? key : `Zoho-enczapikey ${key}`;
      const res = await post(
        `https://${host}/v1.1/email`,
        { Authorization: auth },
        {
          from: { address: msg.fromEmail, ...(msg.fromName ? { name: msg.fromName } : {}) },
          to: [{ email_address: { address: msg.to } }],
          subject: msg.subject,
          htmlbody: msg.html,
          ...(msg.replyTo ? { reply_to: [{ address: msg.replyTo }] } : {}),
        },
      );
      return res.ok ? null : failure(`ZeptoMail (${host})`, res);
    },
  };
}

/**
 * Mailgun, in two entries for the same reason as ZeptoMail: a US key on the EU host is
 * a 401 that looks like a typo.
 *
 * 🟡 The sending domain is taken from the From address rather than asked for. Mailgun
 * puts the domain in the URL, and the only domain that can work is one already verified
 * in that account, which is the domain of the address they are sending from. Asking for
 * it separately invites a mismatch between two fields that must agree.
 */
function mailgun(host: string, id: string): EmailProvider {
  return {
    id,
    async send(cred, msg) {
      const bad = needKey(cred, msg, "Mailgun API key");
      if (bad) return bad;
      const domain = msg.fromEmail.split("@")[1];
      if (!domain) return "From email has no domain, so there is no Mailgun domain to send through.";
      // Form-encoded, not JSON: Mailgun's messages endpoint takes multipart or form data.
      const form = new URLSearchParams({
        from: fromHeader(msg),
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        ...(msg.replyTo ? { "h:Reply-To": msg.replyTo } : {}),
      });
      const res = await fetch(`https://${host}/v3/${encodeURIComponent(domain)}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${cred.apiKey}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res.ok ? null : failure(`Mailgun (${domain})`, res);
    },
  };
}

const RESEND: EmailProvider = {
  id: "RESEND",
  async send(cred, msg) {
    const bad = needKey(cred, msg, "Resend API key");
    if (bad) return bad;
    const res = await post(
      "https://api.resend.com/emails",
      { Authorization: `Bearer ${cred.apiKey}` },
      {
        from: fromHeader(msg),
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      },
    );
    return res.ok ? null : failure("Resend", res);
  },
};

const BREVO: EmailProvider = {
  id: "BREVO",
  async send(cred, msg) {
    const bad = needKey(cred, msg, "Brevo API key");
    if (bad) return bad;
    const res = await post(
      "https://api.brevo.com/v3/smtp/email",
      { "api-key": cred.apiKey as string },
      {
        sender: { email: msg.fromEmail, ...(msg.fromName ? { name: msg.fromName } : {}) },
        to: [{ email: msg.to }],
        subject: msg.subject,
        htmlContent: msg.html,
        ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
      },
    );
    return res.ok ? null : failure("Brevo", res);
  },
};

const SENDGRID: EmailProvider = {
  id: "SENDGRID",
  async send(cred, msg) {
    const bad = needKey(cred, msg, "SendGrid API key");
    if (bad) return bad;
    const res = await post(
      "https://api.sendgrid.com/v3/mail/send",
      { Authorization: `Bearer ${cred.apiKey}` },
      {
        personalizations: [{ to: [{ email: msg.to }] }],
        from: { email: msg.fromEmail, ...(msg.fromName ? { name: msg.fromName } : {}) },
        subject: msg.subject,
        content: [{ type: "text/html", value: msg.html }],
        ...(msg.replyTo ? { reply_to: { email: msg.replyTo } } : {}),
      },
    );
    // 202 Accepted, not 200. res.ok covers both, which is why this is not a === 200.
    return res.ok ? null : failure("SendGrid", res);
  },
};

const POSTMARK: EmailProvider = {
  id: "POSTMARK",
  async send(cred, msg) {
    const bad = needKey(cred, msg, "Postmark server token");
    if (bad) return bad;
    const res = await post(
      "https://api.postmarkapp.com/email",
      { "X-Postmark-Server-Token": cred.apiKey as string },
      {
        From: fromHeader(msg),
        To: msg.to,
        Subject: msg.subject,
        HtmlBody: msg.html,
        MessageStream: "outbound",
        ...(msg.replyTo ? { ReplyTo: msg.replyTo } : {}),
      },
    );
    // 🔴 Postmark answers 200 with an ErrorCode in the body for things like an
    // unconfirmed sender signature, so res.ok alone would report a silent success.
    if (!res.ok) return failure("Postmark", res);
    try {
      const body = (await res.json()) as { ErrorCode?: number; Message?: string };
      if (body.ErrorCode) return `Postmark error ${body.ErrorCode}: ${body.Message ?? "no message"}`;
    } catch {
      // A 200 that is not JSON is still a send. Nothing to report.
    }
    return null;
  },
};

const SMTP2GO: EmailProvider = {
  id: "SMTP2GO",
  async send(cred, msg) {
    const bad = needKey(cred, msg, "SMTP2GO API key");
    if (bad) return bad;
    const res = await post(
      "https://api.smtp2go.com/v3/email/send",
      { "X-Smtp2go-Api-Key": cred.apiKey as string },
      {
        sender: fromHeader(msg),
        to: [msg.to],
        subject: msg.subject,
        html_body: msg.html,
        ...(msg.replyTo ? { custom_headers: [{ header: "Reply-To", value: msg.replyTo }] } : {}),
      },
    );
    if (!res.ok) return failure("SMTP2GO", res);
    // The same trap as Postmark: failures come back inside a 200.
    try {
      const body = (await res.json()) as { data?: { succeeded?: number; error?: string } };
      if (body.data?.error) return `SMTP2GO: ${body.data.error}`;
      if (body.data?.succeeded === 0) return "SMTP2GO accepted the request but sent nothing.";
    } catch {
      // Not JSON, but a 2xx. Treat it as sent.
    }
    return null;
  },
};

/**
 * Plain SMTP, kept for deployments that can actually use it.
 *
 * 🔴 ON RAILWAY THIS WILL TIME OUT. It is offered anyway because the product is not
 * only ever going to run on Railway, and because an owner who has a working relay
 * should not be forced onto someone else's API. The settings screen says so plainly
 * next to the choice, and the test button settles it in ten seconds either way.
 *
 * nodemailer is imported where it is used rather than at the top of this module, so a
 * deployment that never touches SMTP does not pay for it on every cold start.
 */
const SMTP: EmailProvider = {
  id: "SMTP",
  async send(cred, msg) {
    if (!cred.host || !cred.port) return "SMTP host and port are not set.";
    if (!msg.fromEmail) return "From email is not set.";
    const { default: nodemailer } = await import("nodemailer");
    try {
      const transport = nodemailer.createTransport({
        host: cred.host,
        port: cred.port,
        secure: cred.secure,
        auth: cred.user && cred.pass ? { user: cred.user, pass: cred.pass } : undefined,
        // Fail fast with a clear error instead of hanging for ~2 minutes.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        // On 587 (secure=false) enforce the STARTTLS upgrade.
        ...(cred.secure ? {} : { requireTLS: true }),
      });
      await transport.sendMail({
        from: fromHeader(msg),
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      });
      return null;
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      // The one error everybody hits here, named rather than passed through, because
      // "Connection timeout" sends people back to check a password that is fine.
      if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(text)) {
        return `${text} - this host blocks outbound SMTP. Pick one of the HTTPS providers instead.`;
      }
      return text;
    }
  },
};

const EMAIL_PROVIDERS: readonly EmailProvider[] = [
  zeptomail("api.zeptomail.in", "ZEPTOMAIL_IN"),
  zeptomail("api.zeptomail.com", "ZEPTOMAIL_COM"),
  RESEND,
  BREVO,
  SENDGRID,
  POSTMARK,
  mailgun("api.mailgun.net", "MAILGUN"),
  mailgun("api.eu.mailgun.net", "MAILGUN_EU"),
  SMTP2GO,
  SMTP,
];

/**
 * 🔴 The two halves must agree, and this is where that is enforced.
 *
 * The catalog is what the settings screen offers; this file is what actually sends.
 * A row added to one and forgotten in the other would show a customer a provider that
 * silently falls back to SMTP, which on Railway means mail that simply stops. Checked
 * at module load, so it fails on boot in front of whoever wrote it rather than weeks
 * later in front of somebody's customer.
 */
for (const option of EMAIL_PROVIDER_OPTIONS) {
  if (!EMAIL_PROVIDERS.some((p) => p.id === option.id)) {
    throw new Error(`Email provider "${option.id}" is in the catalog but has no sender.`);
  }
}

/**
 * 🟡 Falls back to SMTP rather than throwing. An unknown id here means a row written by
 * a newer deploy than the one reading it, which is a normal few seconds during any
 * rollout, and not a reason to take down every send in the process. SMTP with no host
 * reports that it is not configured, which is the truth and is recoverable.
 */
export function emailProviderById(id: string | null): EmailProvider {
  return (
    EMAIL_PROVIDERS.find((p) => p.id === id) ??
    (EMAIL_PROVIDERS.find((p) => p.id === DEFAULT_PROVIDER_ID) as EmailProvider)
  );
}
