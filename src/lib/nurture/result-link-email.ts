import "server-only";
import { sendEmail } from "@/lib/nurture/send";

/**
 * "Email My Previous Results", sent by the app itself.
 *
 * Owner decision, 20-11-2026: the button used to only fire the result.link_requested
 * event, so the email arrived only if the workspace had a CRM webhook or workflow that
 * emailed on it. A workspace without one got nothing, silently. Now the app sends it
 * from the workspace's own email settings (the platform sender for the platform's own
 * funnels). The event still fires for any CRM that listens.
 *
 * Goes ONLY to the address on the stored result, never to anything typed on the screen.
 * One email per result per five minutes, held in memory, so a person tapping the button
 * repeatedly does not fill their own inbox.
 */
const WINDOW_MS = 5 * 60 * 1000;
const lastSent = new Map<string, number>();

export async function sendResultLinkEmail(input: {
  tenantId: string | null;
  submissionId: string;
  to: string;
  firstName: string | null;
  assessmentTitle: string;
  resultUrl: string;
}): Promise<void> {
  const now = Date.now();
  const prev = lastSent.get(input.submissionId);
  if (prev !== undefined && now - prev < WINDOW_MS) return;
  lastSent.set(input.submissionId, now);

  const name = (input.firstName ?? "").trim();
  const subject = `Your ${input.assessmentTitle} result`;
  const html = `<p>Hi ${escapeHtml(name || "there")},</p>
<p>Here is the result of your ${escapeHtml(input.assessmentTitle)} assessment, as you asked.</p>
<p><a href="${escapeHtml(input.resultUrl)}">Open my result</a></p>
<p>If you did not ask for this, you can ignore this email.</p>`;

  try {
    const err = await sendEmail(input.tenantId, input.to, subject, html);
    if (err) {
      lastSent.delete(input.submissionId); // let a retry go out
      console.error("[result-link-email] send failed:", err);
    }
  } catch (e) {
    lastSent.delete(input.submissionId);
    console.error("[result-link-email] unexpected:", e instanceof Error ? e.message : String(e));
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
