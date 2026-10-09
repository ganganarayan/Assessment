import "server-only";
import { type SupportKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/nurture/send";
import { MARKETING } from "@/lib/marketing/content";
import { PLATFORM_SUPPORT_EMAIL } from "@/lib/platform-support";
import { resolveSupportRouting } from "@/lib/support/config";
import { KIND_NOUN, supportRef } from "@/lib/support/model";
import { replyPayload, type SupportRequestFacts } from "@/lib/support/payload";

/**
 * Everything this feature sends: one email, and one POST.
 *
 * EMAIL goes on the PLATFORM'S OWN credentials, always: resolveSmtpConfig(null) behind
 * the sender. These are messages from Assess360 to its customer, so sending them on the
 * customer's own mail configuration would be wrong twice over, and most tenants have
 * none configured anyway.
 *
 * 🔴 WHATSAPP IS NOT SENT FROM HERE. The owner's CRM already holds the approved
 * templates, the opt-in state and the sending number, so this app posts the FACT of a
 * reply to a webhook and the CRM decides what to do with it. A second sender inside
 * this app would mean a second template to approve, a second number to keep warm, and
 * two sets of sends to reconcile the day somebody asks whether a customer was told.
 *
 * INLINE AND BEST EFFORT, by decision. The durable retry queue exists but needs a
 * Railway cron per job, and a visible failure with a Resend button beside it beats a
 * silent queue somebody has to remember to watch. Every attempt is stamped onto the
 * message row, so a failure is a thing in the thread rather than a thing in the logs.
 *
 * 🔴 The webhook fires in IN_APP MODE ONLY, for the reason the WhatsApp used to: what
 * it produces says "there is a reply in your dashboard", and in EMAIL mode the answer
 * went to their inbox instead.
 */

export type SendStatus = "SENT" | "FAILED" | "SKIPPED";

export interface NotifyOutcome {
  emailStatus: SendStatus;
  emailError: string | null;
  webhookStatus: SendStatus | null;
  webhookError: string | null;
}

/**
 * The facts every sender needs. Defined in lib/support/payload, which is a plain
 * module, so the webhook contract can be exercised without booting the app.
 */
export type RequestFacts = SupportRequestFacts;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The line breaks the writer typed, kept. A support answer is rarely one paragraph. */
function paragraphs(body: string): string {
  return escapeHtml(body)
    .split(/\n{2,}/)
    .map((p) => "<p>" + p.replace(/\n/g, "<br/>") + "</p>")
    .join("\n");
}

/**
 * Where the tenant reads the thread. The workspace is served from the platform host and
 * never from a tenant's own domain, so this is the app URL rather than a resolved host.
 */
export function threadUrl(kind: SupportKind, id: string): string {
  const section = kind === "ONBOARDING" ? "onboarding" : "support";
  return `${env.NEXT_PUBLIC_APP_URL}/w/${section}/${id}`;
}

/** The same thread in the owner's console. */
export function consoleUrl(kind: SupportKind, id: string): string {
  const section = kind === "ONBOARDING" ? "onboarding" : "support";
  return `${env.NEXT_PUBLIC_APP_URL}/admin/${section}/${id}`;
}

function shell(inner: string): string {
  return [
    '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">',
    inner,
    `<p style="color:#666">${MARKETING.name}</p>`,
    "</div>",
  ].join("\n");
}

function button(href: string, label: string): string {
  return (
    `<p><a href="${href}" style="background:#16a34a;color:#fff;text-decoration:none;` +
    `padding:10px 16px;border-radius:8px;display:inline-block">${label}</a></p>`
  );
}

/**
 * The confirmation the tenant gets the moment they raise something.
 *
 * It carries the reference, because the reference is the one thing they can quote back
 * if the conversation does not end up where they left it.
 */
export async function sendRaiseAutoReply(req: RequestFacts, body: string): Promise<SendStatus> {
  const ref = supportRef(req.kind, req.number);
  const err = await sendEmail(
    null,
    req.contactEmail,
    `${ref}: we have your ${KIND_NOUN[req.kind]}`,
    shell(
      [
        `<p>Thanks, we have it. Your reference is <strong>${ref}</strong>.</p>`,
        `<p><strong>${escapeHtml(req.subject)}</strong><br/>`,
        `<span style="color:#666">${escapeHtml(req.topic)}</span></p>`,
        paragraphs(body),
        "<p>You will get an email the moment there is a reply, and the whole conversation stays in your dashboard.</p>",
        button(threadUrl(req.kind, req.id), "Open the thread"),
      ].join("\n"),
    ),
    { replyTo: PLATFORM_SUPPORT_EMAIL },
  ).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
  if (err) console.error("[support] auto-reply failed:", err);
  return err ? "FAILED" : "SENT";
}

/**
 * The owner's own alert, so a queue nobody has badged is still a queue somebody hears
 * about. Best effort and never surfaced to the tenant: the row is stored either way.
 */
export async function alertPlatform(req: RequestFacts, body: string, isReply: boolean): Promise<void> {
  const ref = supportRef(req.kind, req.number);
  const routing = await resolveSupportRouting().catch(() => null);
  const to = routing?.inboxEmail || PLATFORM_SUPPORT_EMAIL;
  await sendEmail(
    null,
    to,
    `${ref} ${isReply ? "reply" : "raised"} - ${req.tenantName}: ${req.subject}`,
    shell(
      [
        `<p><strong>${escapeHtml(req.tenantName)}</strong> ${isReply ? "replied on" : "raised"} ${ref}.</p>`,
        `<p><strong>${escapeHtml(req.subject)}</strong><br/>`,
        `<span style="color:#666">${escapeHtml(req.topic)}</span></p>`,
        paragraphs(body),
        button(consoleUrl(req.kind, req.id), "Open it in the console"),
      ].join("\n"),
    ),
    // Reply-To the tenant: hitting Reply on this should reach the customer, not us.
    { replyTo: req.contactEmail },
  ).catch((e: unknown) => {
    console.error("[support] platform alert failed:", e instanceof Error ? e.message : String(e));
    return "failed";
  });
}

/**
 * Tell the tenant their thread was answered.
 *
 * Email always. WhatsApp only when the mode is IN_APP, a template has been approved and
 * pasted in, and this person actually gave a number. Each of those three has its own
 * SKIPPED, so the thread can name the missing one instead of reporting a vague failure.
 */
export async function notifyTenantOfReply(req: RequestFacts, body: string): Promise<NotifyOutcome> {
  const ref = supportRef(req.kind, req.number);
  const url = threadUrl(req.kind, req.id);

  const emailErr = await sendEmail(
    null,
    req.contactEmail,
    `${ref}: you have a reply`,
    shell(
      [
        `<p>There is a reply on <strong>${ref}</strong>.</p>`,
        `<p><strong>${escapeHtml(req.subject)}</strong></p>`,
        paragraphs(body),
        button(url, "Open the thread"),
        '<p style="color:#666">Reply in the dashboard so the whole conversation stays in one place.</p>',
      ].join("\n"),
    ),
    { replyTo: PLATFORM_SUPPORT_EMAIL },
  ).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

  const routing = await resolveSupportRouting().catch(() => null);
  const mode = req.kind === "ONBOARDING" ? routing?.onboarding : routing?.support;

  let webhookStatus: SendStatus | null = null;
  let webhookError: string | null = null;

  if (mode !== "IN_APP") {
    // Not an error, and not worth a marker in the thread: what the CRM sends from this
    // says "there is a reply in your dashboard", which is only true while the thread is
    // where answers land.
    webhookStatus = null;
  } else if (!routing?.webhookUrl) {
    webhookStatus = "SKIPPED";
    webhookError = "No CRM webhook is configured.";
  } else {
    const err = await postSupportWebhook(routing.webhookUrl, replyPayload(req, body, url, false));
    webhookStatus = err ? "FAILED" : "SENT";
    webhookError = err;
  }

  return {
    emailStatus: emailErr ? "FAILED" : "SENT",
    emailError: emailErr ?? null,
    webhookStatus,
    webhookError,
  };
}

/**
 * Hand a thread to the support inbox, which is what EMAIL mode means.
 *
 * The conversation MOVES. There is no inbound mail ingestion anywhere in this app, so an
 * answer typed into a mail client will never appear in the thread, and the tenant's
 * screen says exactly that from the moment this runs. Pretending otherwise would leave a
 * customer watching a page that was never going to update.
 *
 * 🟡 Reply-To is the TENANT. Support hits Reply and reaches the customer directly, which
 * is the whole point of the mode: with the platform address there, every forwarded
 * ticket comes straight back to the mailbox the switch was flipped to get away from.
 */
export async function forwardToInbox(
  req: RequestFacts,
  messages: ReadonlyArray<{
    authorRole: string;
    authorName: string;
    body: string;
    createdAt: Date;
    isInternal: boolean;
  }>,
  inbox: string,
): Promise<SendStatus> {
  const ref = supportRef(req.kind, req.number);
  const thread = messages
    .filter((m) => !m.isInternal)
    .map((m) =>
      [
        '<div style="border-left:3px solid #ddd;padding-left:12px;margin:12px 0">',
        `<p style="margin:0;color:#666;font-size:13px">${escapeHtml(m.authorName)}`,
        `(${m.authorRole === "PLATFORM" ? "Assess360" : "customer"}),`,
        `${m.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</p>`,
        paragraphs(m.body),
        "</div>",
      ].join("\n"),
    )
    .join("\n");

  const err = await sendEmail(
    null,
    inbox,
    `${ref} - ${req.tenantName}: ${req.subject}`,
    shell(
      [
        `<p><strong>${ref}</strong> from <strong>${escapeHtml(req.tenantName)}</strong>,`,
        "handed over because this queue is set to email.</p>",
        `<p>Topic: ${escapeHtml(req.topic)}<br/>Customer: ${escapeHtml(req.contactEmail)}`,
        req.contactWhatsapp ? ` / ${escapeHtml(req.contactWhatsapp)}` : "",
        "</p>",
        thread,
        '<p style="color:#666">Reply to this email and it goes straight to the customer.',
        "The in-app thread is closed to replies and tells them to check their inbox.</p>",
      ].join("\n"),
    ),
    { replyTo: req.contactEmail },
  ).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
  if (err) console.error("[support] forward failed:", err);
  return err ? "FAILED" : "SENT";
}

/** The facts the senders need, loaded once. Null when the request is gone. */
export async function requestFacts(id: string): Promise<RequestFacts | null> {
  const r = await prisma.supportRequest.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      kind: true,
      topic: true,
      subject: true,
      contactEmail: true,
      contactWhatsapp: true,
      tenantId: true,
      tenant: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!r) return null;
  return {
    id: r.id,
    number: r.number,
    kind: r.kind,
    topic: r.topic,
    subject: r.subject,
    contactEmail: r.contactEmail,
    contactWhatsapp: r.contactWhatsapp,
    contactName: r.createdBy?.name ?? null,
    tenantId: r.tenantId,
    tenantName: r.tenant.name,
  };
}

const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * One POST. Returns the error string, or null.
 *
 * NO AUTOMATIC RETRY, deliberately. The message row keeps the failure, the thread shows
 * it, and the Resend button is the retry. A retry in here would double-message a
 * customer the moment a CRM answered slowly rather than not at all, and a duplicate
 * WhatsApp is worse than a late one.
 */
export async function postSupportWebhook(
  url: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (res.ok) return null;
    const text = await res.text().catch(() => "");
    return `HTTP ${res.status}: ${text.slice(0, 200)}`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
