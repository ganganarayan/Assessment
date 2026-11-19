import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";

/**
 * Tell the platform owners the moment an AI provider stops generating for lack of
 * credit.
 *
 * Owner decision, 19-11-2026: a result page has NO fallback text for the AI statement.
 * The one way a statement goes missing is the provider account running out of credit,
 * so that case has to reach a human at once instead of quietly blanking every result.
 *
 * Both addresses get it, sent at the same time, from the PLATFORM sender (tenantId null).
 * Platform constants, not settings, on the same footing as PLATFORM_SUPPORT_EMAIL: they
 * are the owner's own inboxes, not anything a tenant configures.
 *
 * 🟡 One email per provider per key owner per hour, held in this process's memory. A
 * live room of 60 people hitting an empty balance would otherwise send 120 emails. A
 * restart or a second replica can send one extra, which is the right side to err on.
 */
export const AI_CREDIT_ALERT_RECIPIENTS = ["connect@divineleads.guru", "connect@applygitawisdom.com"] as const;

const WINDOW_MS = 60 * 60 * 1000;
const lastSent = new Map<string, number>();

/**
 * Is this provider error "out of credit / quota"?
 *
 * Matched on the error text the provider returns, because the status alone is not
 * enough: Claude says it with a 400, OpenAI with a 429 that also means rate limiting.
 *   - Claude: "Your credit balance is too low to access the Anthropic API"
 *   - OpenAI: code insufficient_quota, "You exceeded your current quota"
 *   - Gemini: RESOURCE_EXHAUSTED with a quota or billing message, or prepaid credits depleted
 */
export function isCreditExhausted(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes("credit balance")) return true;
  if (m.includes("insufficient_quota")) return true;
  if (m.includes("exceeded your current quota")) return true;
  if (/\b402\b/.test(m)) return true;
  if (m.includes("credits") && (m.includes("depleted") || m.includes("exhausted") || m.includes("insufficient"))) return true;
  if (m.includes("billing") && (m.includes("not enabled") || m.includes("disabled") || m.includes("inactive"))) return true;
  return false;
}

export interface CreditAlertInput {
  provider: string;
  model: string;
  /** True when the call ran on the platform's key; false = the workspace's own key. */
  onPlatformKey: boolean;
  tenantId: string | null;
  purpose: string;
  error: string;
}

/** Best-effort, never throws: the caller is a respondent waiting on their result. */
export async function alertAiCreditExhausted(input: CreditAlertInput): Promise<void> {
  try {
    const keyOwner = input.onPlatformKey ? "platform" : `tenant:${input.tenantId ?? "platform"}`;
    const throttleKey = `${input.provider}|${keyOwner}`;
    const now = Date.now();
    const prev = lastSent.get(throttleKey);
    if (prev !== undefined && now - prev < WINDOW_MS) return;
    lastSent.set(throttleKey, now);

    const workspace = isPlatformScope(input.tenantId)
      ? "Platform"
      : ((
          await prisma.tenant.findUnique({ where: { id: input.tenantId as string }, select: { name: true } })
        )?.name ?? input.tenantId ?? "Unknown");
    const keyLine = input.onPlatformKey
      ? "the PLATFORM key (every workspace on the platform key is affected)"
      : `${workspace}'s own key (only that workspace is affected)`;
    const providerName = { claude: "Anthropic (Claude)", openai: "OpenAI", gemini: "Google (Gemini)" }[input.provider] ?? input.provider;

    const subject = `AI credits exhausted: ${providerName} stopped generating`;
    const html = `<p>The ${escapeHtml(providerName)} account has run out of credit. AI statements are not being written, so result pages show no AI statement until it is topped up.</p>
<ul>
<li>Provider: ${escapeHtml(providerName)}</li>
<li>Model: ${escapeHtml(input.model)}</li>
<li>Key: ${escapeHtml(keyLine)}</li>
<li>Workspace that hit it: ${escapeHtml(workspace)}</li>
<li>While generating: ${escapeHtml(input.purpose)}</li>
<li>Time: ${formatIST(new Date())} IST</li>
</ul>
<p>Provider said: ${escapeHtml(input.error.slice(0, 400))}</p>
<p>Top up the provider account. The next alert for this key is held for one hour.</p>`;

    // Imported here, not at the top: the mail stack reaches back into the event and
    // completion modules, and this file sits under the AI generator they also use.
    const { sendEmail } = await import("@/lib/nurture/send");
    const results = await Promise.all(
      AI_CREDIT_ALERT_RECIPIENTS.map((to) => sendEmail(null, to, subject, html)),
    );
    results.forEach((err, i) => {
      if (err) console.error(`[ai-credit-alert] send to ${AI_CREDIT_ALERT_RECIPIENTS[i]} failed:`, err);
    });
    // Nothing went out at all: let the next failure try again rather than wait an hour.
    if (results.every((err) => err)) lastSent.delete(throttleKey);
  } catch (e) {
    console.error("[ai-credit-alert] unexpected:", e instanceof Error ? e.message : String(e));
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
