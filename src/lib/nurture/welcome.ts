import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/nurture/send";
import { supportEmailFor } from "@/lib/billing/gate";

/**
 * The one email a new workspace receives, the moment it is provisioned.
 *
 * Stored as an editable template on the singleton AppSetting rather than written into
 * this file: the first thing a customer reads is exactly the kind of copy that gets
 * rewritten five times in a fortnight, and none of those rewrites should need a
 * deploy.
 *
 * 🔴 There is no password placeholder and there never will be. A self-serve signup
 * chose their own password; a mailed credential turns every inbox, forward and backup
 * into a copy of the account. {{resetUrl}} sends them to set a new one instead, which
 * is the same thing they actually want and safe to put in writing.
 *
 * Best-effort throughout. This runs inside account provisioning, so a mail failure
 * must never cost someone their signup - it logs and returns.
 */

export const WELCOME_PLACEHOLDERS = [
  "{{name}}",
  "{{email}}",
  "{{workspaceUrl}}",
  "{{resetUrl}}",
  "{{signInUrl}}",
  "{{supportEmail}}",
] as const;

/** Shipped copy, used when the owner has not written their own yet. Plain, specific,
 *  and every claim in it is true of a workspace that has just been created. */
export const DEFAULT_WELCOME_SUBJECT = "Your Assess360 workspace is ready";

export const DEFAULT_WELCOME_BODY = `<p>Hi {{name}},</p>
<p>Your workspace is ready. You are signed in with <strong>{{email}}</strong>.</p>
<p><a href="{{workspaceUrl}}">Open my workspace</a></p>
<h3>Getting started</h3>
<ol>
  <li><strong>Build your first scorecard.</strong> Write it in plain text and let the importer turn it into questions, categories and scoring, or start from a blank one.</li>
  <li><strong>Add a qualification gate.</strong> Decide who is worth asking before you ask them. Disqualified visitors cost you nothing and never count against your responses.</li>
  <li><strong>Publish and share the link.</strong> Every response lands in Submissions with its score, its band and where it came from.</li>
</ol>
<p>If you ever need to change your password, you can <a href="{{resetUrl}}">set a new one here</a>. We will never send you a password by email.</p>
<p>You can sign in any time at <a href="{{signInUrl}}">{{signInUrl}}</a>.</p>
<p>Any questions, just email <a href="mailto:{{supportEmail}}">{{supportEmail}}</a> and a human will answer.</p>`;

function fill(template: string, vars: Record<string, string>): string {
  // An unknown placeholder is left exactly as written rather than blanked: a visible
  // {{whatever}} in a test send is a bug report, an empty gap is a mystery.
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => vars[key] ?? whole);
}

/**
 * Send the welcome email for a freshly provisioned workspace.
 *
 * Sent from the PLATFORM's own sender (tenantId null): this is a message from the
 * product to its new customer, not something a tenant's own SMTP should carry.
 */
export async function sendWelcomeEmail(user: { name?: string | null; email: string }): Promise<void> {
  try {
    const s = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { welcomeEmailEnabled: true },
    });
    if (!s?.welcomeEmailEnabled) return;
    const err = await sendWelcomeTestTo(user.email, user.name);
    if (err) console.error("[welcome] send failed:", err);
  } catch (e) {
    console.error("[welcome] unexpected:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Render and send the welcome email to one address, IGNORING the enabled flag.
 *
 * Shared by the real send and the admin test button, so what the owner tests is
 * byte-for-byte what a new customer receives. Returns an error string, or null.
 */
export async function sendWelcomeTestTo(to: string, name?: string | null): Promise<string | null> {
  try {
    const s = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { welcomeEmailSubject: true, welcomeEmailBody: true },
    });

    const base = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    // The support address comes from Settings, never from a constant in this file: it is
    // the kind of value that changes once and then has to be right in every message
    // that already went out as well as every one that has not.
    const support = (await supportEmailFor(null)) ?? "";

    const vars: Record<string, string> = {
      supportEmail: support,
      name: (name ?? "").trim() || "there",
      email: to,
      workspaceUrl: `${base}/w`,
      signInUrl: `${base}/sign-in`,
      // The reset FLOW, not a token: a link minted here would be a live credential
      // sitting in an inbox for as long as the mail survives. This page asks for their
      // address and mints a short-lived one at the moment they ask for it.
      resetUrl: `${base}/forgot-password`,
    };

    const subject = fill(s?.welcomeEmailSubject?.trim() || DEFAULT_WELCOME_SUBJECT, vars);
    let template = s?.welcomeEmailBody?.trim() || DEFAULT_WELCOME_BODY;
    // No support address configured? Drop the paragraph that offers one rather than
    // mailing "just email  and a human will answer". A line that depends on a value
    // nobody has set is removed, not rendered half-empty.
    if (!support) template = template.replace(/<p>(?:(?!<\/p>)[\s\S])*\{\{supportEmail\}\}(?:(?!<\/p>)[\s\S])*<\/p>\s*/g, "");
    const html = fill(template, vars);
    return await sendEmail(null, to, subject, html);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
